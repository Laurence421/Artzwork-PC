import "server-only";
import { cacheTag } from "next/cache";
import { resolveBranding, type Branding } from "@/features/shared/lib/branding";
import { CATALOG_TAG } from "@/features/shared/lib/cache-tags";
import { publicImageUrl } from "@/features/shared/lib/storage";
import { createPublicClient } from "@/lib/supabase/public";

export type ShopProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  salePrice: number | null;
  soldOut: boolean;
  image: { url: string; alt: string } | null;
  labels: { text: string; color: string }[];
  categoryId: string | null;
  createdAt: string;
};

/** productCount: visible products in it; menus only offer categories that have some. */
export type ShopCategory = { id: string; name: string; slug: string; productCount: number };

export type Shop = {
  name: string;
  tagline: string | null;
  branding: Branding;
  categories: ShopCategory[];
  products: ShopProduct[];
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  price: number;
  sale_price: number | null;
  stock: number;
  is_sold_out: boolean;
  product_images: { path: string; alt: string; position: number }[];
  product_labels: { labels: { text: string; color: string } | null }[];
  category_id?: string | null;
  created_at?: string;
};

export type ShopProductDetail = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  salePrice: number | null;
  stock: number;
  soldOut: boolean;
  category: string | null;
  images: { url: string; alt: string }[];
  labels: { text: string; color: string }[];
};

/** One visible product by its link name, for the product page. Null if hidden or missing. */
export async function getShopProduct(slug: string): Promise<ShopProductDetail | null> {
  "use cache";
  cacheTag(CATALOG_TAG);

  const { data: p } = await createPublicClient()
    .from("products")
    .select(
      "id, name, slug, description, price, sale_price, stock, is_sold_out, categories(name), product_images(path, alt, position), product_labels(labels(text, color))",
    )
    .eq("slug", slug)
    .maybeSingle<ProductRow & { description: string; categories: { name: string } | null }>();
  if (!p) return null;

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    price: p.price,
    salePrice: p.sale_price,
    stock: p.is_sold_out ? 0 : p.stock,
    soldOut: p.is_sold_out || p.stock <= 0,
    category: p.categories?.name ?? null,
    images: [...p.product_images]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ url: publicImageUrl(i.path), alt: i.alt || p.name })),
    labels: p.product_labels.flatMap((l) => (l.labels ? [l.labels] : [])),
  };
}

export type CartLine = {
  id: string;
  name: string;
  slug: string;
  unitPrice: number;
  price: number;
  stock: number;
  image: string | null;
};

/** Current name, price and stock for cart items. Missing ids = no longer sold. Never cached: checkout needs live stock. */
export async function getCartLines(ids: string[]): Promise<CartLine[]> {
  if (ids.length === 0) return [];
  const { data } = await createPublicClient()
    .from("products")
    .select("id, name, slug, price, sale_price, stock, is_sold_out, product_images(path, alt, position)")
    .in("id", ids)
    .returns<ProductRow[]>();

  return (data ?? []).map((p) => {
    const first = [...p.product_images].sort((a, b) => a.position - b.position)[0];
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      unitPrice: p.sale_price ?? p.price,
      price: p.price,
      stock: p.is_sold_out ? 0 : p.stock,
      image: first ? publicImageUrl(first.path) : null,
    };
  });
}

export type CheckoutOptions = {
  storeSlug: string;
  payments: { id: string; type: string; label: string; instructions: string; online: boolean }[];
  shipping: { id: string; name: string; description: string; fee: number; kind: "delivery" | "pickup" }[];
};

/** Enabled payment methods and shipping options (RLS returns only enabled ones to the public). */
export async function getCheckoutOptions(): Promise<CheckoutOptions | null> {
  "use cache";
  cacheTag(CATALOG_TAG);

  const supabase = createPublicClient();
  const { data: store } = await supabase.from("stores").select("id, slug").limit(1).maybeSingle();
  if (!store) return null;
  const [payments, shipping] = await Promise.all([
    supabase.from("payment_methods").select("id, type, label, instructions, online").eq("store_id", store.id).order("position"),
    supabase.from("shipping_options").select("id, name, description, fee, kind").eq("store_id", store.id).order("position"),
  ]);
  return { storeSlug: store.slug, payments: payments.data ?? [], shipping: shipping.data ?? [] };
}

/** The one store and its visible products, newest first. Public data, cached until the seller changes it. */
export async function getShop(): Promise<Shop | null> {
  "use cache";
  cacheTag(CATALOG_TAG);

  const supabase = createPublicClient();
  const { data: store } = await supabase.from("stores").select("id, name, tagline, branding, theme").limit(1).maybeSingle();
  if (!store) return null;

  const [{ data: rows }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, slug, price, sale_price, stock, is_sold_out, category_id, created_at, product_images(path, alt, position), product_labels(labels(text, color))",
      )
      .eq("store_id", store.id)
      .order("created_at", { ascending: false })
      .returns<ProductRow[]>(),
    supabase.from("categories").select("id, name, slug").eq("store_id", store.id).order("position").order("name"),
  ]);
  const products = rows ?? [];
  const counts = new Map<string, number>();
  for (const p of products) if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);

  return {
    name: store.name,
    tagline: store.tagline,
    branding: resolveBranding(store, publicImageUrl),
    categories: (categories ?? []).map((c) => ({ ...c, productCount: counts.get(c.id) ?? 0 })),
    products: products.map((p) => {
      const first = [...p.product_images].sort((a, b) => a.position - b.position)[0];
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: p.price,
        salePrice: p.sale_price,
        soldOut: p.is_sold_out || p.stock <= 0,
        image: first ? { url: publicImageUrl(first.path), alt: first.alt || p.name } : null,
        labels: p.product_labels.flatMap((l) => (l.labels ? [l.labels] : [])),
        categoryId: p.category_id ?? null,
        createdAt: p.created_at ?? "",
      };
    }),
  };
}
