import "server-only";
import { publicImageUrl } from "@/features/shared/lib/storage";
import { getSellerStore } from "./store";

export type ProductFilter = "all" | "visible" | "hidden" | "out";

export type SellerProductRow = {
  id: string;
  name: string;
  price: number;
  salePrice: number | null;
  stock: number;
  lowStockThreshold: number;
  isVisible: boolean;
  soldOut: boolean;
  imageUrl: string | null;
  labels: { id: string; text: string; color: string }[];
  category: string | null;
};

type Row = {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  stock: number;
  low_stock_threshold: number;
  is_visible: boolean;
  is_sold_out: boolean;
  product_images: { path: string; position: number }[];
  product_labels: { labels: { id: string; text: string; color: string } | null }[];
  categories: { name: string } | null;
};

export async function listProducts({ q, filter }: { q?: string; filter: ProductFilter }) {
  const { supabase, store } = await getSellerStore();

  let query = supabase
    .from("products")
    .select(
      "id, name, price, sale_price, stock, low_stock_threshold, is_visible, is_sold_out, product_images(path, position), product_labels(labels(id, text, color)), categories(name)",
    )
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  if (filter === "visible") query = query.eq("is_visible", true);
  if (filter === "hidden") query = query.eq("is_visible", false);
  if (filter === "out") query = query.or("stock.eq.0,is_sold_out.eq.true");
  // Escape LIKE wildcards so a search for "50%" means the text "50%".
  if (q) query = query.ilike("name", `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);

  const { data } = await query.returns<Row[]>();
  return (data ?? []).map((p): SellerProductRow => {
    const cover = [...p.product_images].sort((a, b) => a.position - b.position)[0];
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      salePrice: p.sale_price,
      stock: p.stock,
      lowStockThreshold: p.low_stock_threshold,
      isVisible: p.is_visible,
      soldOut: p.is_sold_out || p.stock <= 0,
      imageUrl: cover ? publicImageUrl(cover.path) : null,
      labels: p.product_labels.flatMap((l) => (l.labels ? [l.labels] : [])),
      category: p.categories?.name ?? null,
    };
  });
}

export type ProductOptions = {
  categories: { id: string; name: string }[];
  labels: { id: string; text: string; color: string }[];
};

/** Starter categories for a computer shop, created the first time the product form opens. */
const STARTER_CATEGORIES = [
  { name: "Accessories", slug: "accessories" },
  { name: "PC Set", slug: "pc-set" },
  { name: "PC Components", slug: "pc-components" },
  { name: "Laptops", slug: "laptops" },
];

/** Categories and labels the product form offers. */
export async function getProductOptions(): Promise<ProductOptions> {
  const { supabase, store } = await getSellerStore();
  const listCategories = () =>
    supabase.from("categories").select("id, name").eq("store_id", store.id).order("position").order("name");

  const [first, labels] = await Promise.all([
    listCategories(),
    supabase.from("labels").select("id, text, color").eq("store_id", store.id).order("created_at"),
  ]);

  let categories = first.data ?? [];
  if (categories.length === 0) {
    // ignoreDuplicates: two tabs opening the form at once can't create doubles (unique store_id + slug).
    await supabase
      .from("categories")
      .upsert(
        STARTER_CATEGORIES.map((c, position) => ({ ...c, position, store_id: store.id })),
        { onConflict: "store_id,slug", ignoreDuplicates: true },
      );
    categories = (await listCategories()).data ?? [];
  }

  return { categories, labels: labels.data ?? [] };
}

export type EditableProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  salePrice: number | null;
  stock: number;
  lowStockThreshold: number;
  isVisible: boolean;
  isSoldOut: boolean;
  categoryId: string | null;
  labelIds: string[];
  images: { path: string; alt: string; url: string }[];
};

export async function getProduct(id: string): Promise<EditableProduct | null> {
  const { supabase, store } = await getSellerStore();
  const { data: p } = await supabase
    .from("products")
    .select(
      "id, name, description, price, sale_price, stock, low_stock_threshold, is_visible, is_sold_out, category_id, product_images(path, alt, position), product_labels(label_id)",
    )
    .eq("store_id", store.id)
    .eq("id", id)
    .maybeSingle<{
      id: string;
      name: string;
      description: string;
      price: number;
      sale_price: number | null;
      stock: number;
      low_stock_threshold: number;
      is_visible: boolean;
      is_sold_out: boolean;
      category_id: string | null;
      product_images: { path: string; alt: string; position: number }[];
      product_labels: { label_id: string }[];
    }>();
  if (!p) return null;

  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    salePrice: p.sale_price,
    stock: p.stock,
    lowStockThreshold: p.low_stock_threshold,
    isVisible: p.is_visible,
    isSoldOut: p.is_sold_out,
    categoryId: p.category_id,
    labelIds: p.product_labels.map((l) => l.label_id),
    images: [...p.product_images]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ path: i.path, alt: i.alt, url: publicImageUrl(i.path) })),
  };
}
