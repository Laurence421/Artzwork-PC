"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { CATALOG_TAG } from "@/features/shared/lib/cache-tags";
import { parsePesos } from "@/features/shared/lib/money";
import { ASSETS_BUCKET } from "@/features/shared/lib/storage";
import { MAX_LABELS_PER_PRODUCT, MAX_NEW_LABELS, NEW_CATEGORY, type NewLabel } from "../lib/organize";
import { redirectOnSite } from "@/lib/site-server";
import { getSellerStore } from "../queries/store";

/** values: what was submitted, so the form can show it again after React resets it. */
export type ProductFormState = {
  error?: string;
  values?: ProductFormValues;
  /** Set once a new product exists, so a retry updates it instead of creating another. */
  productId?: string;
  fieldErrors?: Partial<Record<"name" | "description" | "price" | "salePrice" | "stock" | "lowStockThreshold" | "newCategory" | "labels", string>>;
};

const whole = (label: string) =>
  z.coerce
    .number({ error: `Enter ${label}` })
    .int({ error: "Use a whole number" })
    .min(0, { error: "Can't be below 0" })
    .max(1_000_000, { error: "That's too many" });

const schema = z
  .object({
    name: z.string().trim().min(1, { error: "Enter a product name" }).max(120, { error: "Keep it under 120 characters" }),
    description: z.string().max(10_000, { error: "Keep it under 10,000 characters" }),
    price: z.string().transform((v, ctx) => {
      const c = parsePesos(v);
      if (c === null) ctx.addIssue({ code: "custom", message: "Enter a price, like 1250 or 1250.50" });
      return c ?? 0;
    }),
    salePrice: z.string().transform((v, ctx) => {
      if (v.trim() === "") return null;
      const c = parsePesos(v);
      if (c === null) ctx.addIssue({ code: "custom", message: "Enter a price, like 999 or 999.50" });
      return c;
    }),
    stock: whole("how many you have"),
    lowStockThreshold: whole("a number"),
    categoryId: z.string().uuid().or(z.literal("")).or(z.literal(NEW_CATEGORY)),
    newCategory: z.string().trim().max(60, { error: "Keep it under 60 characters" }),
    newLabels: z
      .array(z.object({ text: z.string().trim().min(1).max(24), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }))
      .max(MAX_NEW_LABELS, { error: `Add up to ${MAX_NEW_LABELS} new labels at a time.` }),
    labelIds: z.array(z.string().uuid()),
    isVisible: z.boolean(),
    isSoldOut: z.boolean(),
    images: z.array(z.object({ path: z.string().min(1).max(300), alt: z.string().max(200) })).max(12),
  })
  .refine((v) => v.salePrice === null || v.salePrice < v.price, {
    path: ["salePrice"],
    message: "Sale price must be lower than the price",
  })
  .refine((v) => v.labelIds.length + v.newLabels.length <= MAX_LABELS_PER_PRODUCT, {
    path: ["labels"],
    message: `A product can have up to ${MAX_LABELS_PER_PRODUCT} labels.`,
  })
  .refine((v) => v.categoryId !== NEW_CATEGORY || v.newCategory.length > 0, {
    path: ["newCategory"],
    message: "Enter a category name",
  });

export type ProductFormValues = {
  name: string;
  description: string;
  price: string;
  salePrice: string;
  stock: string;
  lowStockThreshold: string;
  categoryId: string;
  newCategory: string;
  newLabels: NewLabel[];
  labelIds: string[];
  isVisible: boolean;
  isSoldOut: boolean;
};

function readJson(raw: FormDataEntryValue | null) {
  try {
    return JSON.parse(String(raw ?? "[]"));
  } catch {
    return [];
  }
}

/** "Artz Print #1" -> "artz-print-1" */
function slugify(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "product";
}

/** Create (no id) or update a product, with its photos and labels. */
export async function saveProduct(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const { supabase, store } = await getSellerStore();
  const id = String(formData.get("id") ?? "") || null;

  const values: ProductFormValues = {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    price: String(formData.get("price") ?? ""),
    salePrice: String(formData.get("salePrice") ?? ""),
    stock: String(formData.get("stock") ?? "0"),
    lowStockThreshold: String(formData.get("lowStockThreshold") ?? "5"),
    categoryId: String(formData.get("categoryId") ?? ""),
    newCategory: String(formData.get("newCategory") ?? ""),
    newLabels: readJson(formData.get("newLabels")),
    labelIds: formData.getAll("labelIds").map(String),
    isVisible: formData.get("isVisible") === "on",
    isSoldOut: formData.get("isSoldOut") === "on",
  };
  const parsed = schema.safeParse({ ...values, images: readJson(formData.get("images")) });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors;
    const fieldErrors = {
      name: flat.name?.[0],
      description: flat.description?.[0],
      price: flat.price?.[0],
      salePrice: flat.salePrice?.[0],
      stock: flat.stock?.[0],
      lowStockThreshold: flat.lowStockThreshold?.[0],
      newCategory: flat.newCategory?.[0],
      labels: (flat as Record<string, string[] | undefined>).labels?.[0] ?? flat.newLabels?.[0],
    };
    // Only point at the fields when one of them is the problem.
    const marked = Object.values(fieldErrors).some(Boolean);
    return {
      error: marked ? "Fix the fields marked in red." : "We couldn't save this product. Reload the page and try again.",
      values,
      fieldErrors,
    };
  }
  const v = parsed.data;

  // Photos must live in this store's folder (the database checks this too).
  if (v.images.some((i) => !i.path.startsWith(`${store.id}/`))) {
    return { error: "A photo couldn't be saved. Remove it and upload it again.", values };
  }

  /** "mug", "mug-2", ...: unique within the store for that table. */
  const uniqueSlug = async (table: "products" | "categories", base: string) => {
    const { data: taken } = await supabase.from(table).select("slug").eq("store_id", store.id).like("slug", `${base}%`);
    const used = new Set((taken ?? []).map((t) => t.slug));
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    return slug;
  };

  // A new category typed in the form: reuse one with the same name, else create it.
  let categoryId: string | null = v.categoryId === NEW_CATEGORY ? null : v.categoryId || null;
  if (v.categoryId === NEW_CATEGORY) {
    const { data: same } = await supabase
      .from("categories")
      .select("id")
      .eq("store_id", store.id)
      .ilike("name", v.newCategory.replace(/[\\%_]/g, (c) => `\\${c}`))
      .maybeSingle();
    if (same) {
      categoryId = same.id;
    } else {
      const { data: last } = await supabase
        .from("categories")
        .select("position")
        .eq("store_id", store.id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: created, error } = await supabase
        .from("categories")
        .insert({ store_id: store.id, name: v.newCategory, slug: await uniqueSlug("categories", slugify(v.newCategory)), position: (last?.position ?? -1) + 1 })
        .select("id")
        .single();
      if (error || !created) return { error: "We couldn't add that category. Try again.", values };
      categoryId = created.id;
    }
  }

  const fields = {
    name: v.name,
    description: v.description,
    price: v.price,
    sale_price: v.salePrice,
    stock: v.stock,
    low_stock_threshold: v.lowStockThreshold,
    is_visible: v.isVisible,
    is_sold_out: v.isSoldOut,
    category_id: categoryId,
  };

  let productId = id;
  let removedPaths: string[] = [];

  if (productId) {
    const { data: old } = await supabase.from("product_images").select("path").eq("product_id", productId);
    const { error } = await supabase.from("products").update(fields).eq("id", productId).eq("store_id", store.id);
    if (error) return { error: "We couldn't save this product. Try again.", values };
    removedPaths = (old ?? []).map((i) => i.path).filter((p) => !v.images.some((i) => i.path === p));
  } else {
    // Product links use a slug that is unique in the store: "mug", "mug-2", ...
    const slug = await uniqueSlug("products", slugify(v.name));

    const { data: created, error } = await supabase
      .from("products")
      .insert({ ...fields, store_id: store.id, slug })
      .select("id")
      .single();
    if (error || !created) return { error: "We couldn't save this product. Try again.", values };
    productId = created.id;
  }

  // Photos and labels: replace the product's set with what the form sent.
  await supabase.from("product_images").delete().eq("product_id", productId);
  if (v.images.length) {
    const { error } = await supabase.from("product_images").insert(
      v.images.map((img, position) => ({ store_id: store.id, product_id: productId, path: img.path, alt: img.alt, position })),
    );
    if (error) return { error: "The product was saved, but its photos weren't. Try saving again.", values, productId: productId ?? undefined };
  }

  // Labels typed in the form become reusable labels for the store.
  // A typed label whose text already exists (any case) reuses that label, so a retry can't make doubles.
  let labelIds = v.labelIds;
  if (v.newLabels.length) {
    const { data: existing } = await supabase.from("labels").select("id, text").eq("store_id", store.id);
    const byText = new Map((existing ?? []).map((l) => [l.text.toLowerCase(), l.id]));
    const toCreate: NewLabel[] = [];
    for (const l of v.newLabels) {
      const id = byText.get(l.text.toLowerCase());
      if (id) labelIds = [...labelIds, id];
      else if (!toCreate.some((c) => c.text.toLowerCase() === l.text.toLowerCase())) toCreate.push(l);
    }
    if (toCreate.length) {
      const { data: created, error } = await supabase
        .from("labels")
        .insert(toCreate.map((l) => ({ store_id: store.id, text: l.text, color: l.color })))
        .select("id");
      if (error || !created) return { error: "The product was saved, but its new labels weren't. Try saving again.", values, productId: productId ?? undefined };
      labelIds = [...labelIds, ...created.map((l) => l.id)];
    }
    labelIds = [...new Set(labelIds)];
  }

  await supabase.from("product_labels").delete().eq("product_id", productId);
  if (labelIds.length) {
    const { error } = await supabase
      .from("product_labels")
      .insert(labelIds.map((label_id) => ({ store_id: store.id, product_id: productId, label_id })));
    if (error) return { error: "The product was saved, but its labels weren't. Try saving again.", values, productId: productId ?? undefined };
  }

  if (removedPaths.length) await supabase.storage.from(ASSETS_BUCKET).remove(removedPaths);

  updateTag(CATALOG_TAG);
  return redirectOnSite("/products?saved=1");
}

export type DeleteState = { error?: string };

/** Bound to one product id; returns an error, or redirects to the list once deleted. */
export async function deleteProduct(productId: string): Promise<DeleteState> {
  const { supabase, store } = await getSellerStore();
  const { data: images } = await supabase.from("product_images").select("path").eq("product_id", productId);
  const { error } = await supabase.from("products").delete().eq("id", productId).eq("store_id", store.id);
  if (error) return { error: "We couldn't delete this product. Try again." };
  if (images?.length) await supabase.storage.from(ASSETS_BUCKET).remove(images.map((i) => i.path));
  updateTag(CATALOG_TAG);
  return redirectOnSite("/products?deleted=1");
}

export type BulkState = { message?: string; error?: string };

/** Show, hide or delete the ticked products. */
export async function bulkProducts(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const { supabase, store } = await getSellerStore();
  const action = String(formData.get("action") ?? "");
  const ids = z.array(z.string().uuid()).min(1).max(500).safeParse(formData.getAll("ids").map(String));
  if (!ids.success) return { error: "Tick at least one product." };

  if (action === "show" || action === "hide") {
    const { error } = await supabase
      .from("products")
      .update({ is_visible: action === "show" })
      .eq("store_id", store.id)
      .in("id", ids.data);
    if (error) return { error: "We couldn't update those products. Try again." };
  } else if (action === "delete") {
    const { data: images } = await supabase
      .from("product_images")
      .select("path")
      .eq("store_id", store.id)
      .in("product_id", ids.data);
    const { error } = await supabase.from("products").delete().eq("store_id", store.id).in("id", ids.data);
    if (error) return { error: "We couldn't delete those products. Try again." };
    if (images?.length) await supabase.storage.from(ASSETS_BUCKET).remove(images.map((i) => i.path));
  } else {
    return { error: "Choose what to do with the ticked products." };
  }

  updateTag(CATALOG_TAG);
  const n = ids.data.length;
  const noun = n === 1 ? "product" : "products";
  return {
    message:
      action === "delete" ? `Deleted ${n} ${noun}.` : `${n} ${noun} ${action === "show" ? "now shown in" : "hidden from"} the shop.`,
  };
}
