import { parsePesos } from "@/features/shared/lib/money";
import type { Shop, ShopCategory, ShopProduct } from "../queries/catalog";

// Browsing works on the shop's cached product list (one store, a modest catalogue), so
// filters and sorting use the price customers actually pay, sale price included.

export const PAGE_SIZE = 24;

export type SortKey = "newest" | "price-asc" | "price-desc";
export const SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];

export type BrowseParams = {
  q: string;
  category: string;
  /** Raw text as typed, kept for the form. */
  minText: string;
  maxText: string;
  min: number | null;
  max: number | null;
  sort: SortKey;
  page: number;
};

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export function parseBrowseParams(raw: Raw): BrowseParams {
  const minText = one(raw.min).trim().slice(0, 12);
  const maxText = one(raw.max).trim().slice(0, 12);
  const page = Number.parseInt(one(raw.page), 10);
  return {
    q: one(raw.q).trim().slice(0, 100),
    category: one(raw.category).trim().slice(0, 80),
    minText,
    maxText,
    min: minText ? parsePesos(minText) : null,
    max: maxText ? parsePesos(maxText) : null,
    sort: SORTS.some((s) => s.value === raw.sort) ? (raw.sort as SortKey) : "newest",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** The price a customer pays. */
export const payPrice = (p: ShopProduct) => p.salePrice ?? p.price;

export type BrowseResult = {
  items: ShopProduct[];
  total: number;
  page: number;
  pages: number;
  category: ShopCategory | null;
};

export function browse(shop: Shop, p: BrowseParams): BrowseResult {
  const category = shop.categories.find((c) => c.slug === p.category) ?? null;
  // A category link that matches nothing (renamed or removed) shows no products, not everything.
  if (p.category && !category) return { items: [], total: 0, page: 1, pages: 1, category: null };
  const words = p.q.toLowerCase().split(/\s+/).filter(Boolean);

  let list = shop.products.filter((prod) => {
    if (category && prod.categoryId !== category.id) return false;
    if (words.length && !words.every((w) => prod.name.toLowerCase().includes(w))) return false;
    const price = payPrice(prod);
    if (p.min !== null && price < p.min) return false;
    if (p.max !== null && price > p.max) return false;
    return true;
  });

  if (p.sort === "price-asc") list = [...list].sort((a, b) => payPrice(a) - payPrice(b));
  if (p.sort === "price-desc") list = [...list].sort((a, b) => payPrice(b) - payPrice(a));
  // "newest" is the list's own order (newest first from the query).

  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.min(p.page, pages);
  return { items: list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: list.length, page, pages, category };
}

/** /products link keeping the current filters, with some of them changed. */
export function browseHref(p: BrowseParams, change: Partial<Record<"q" | "category" | "min" | "max" | "sort" | "page", string>>) {
  const values: Record<string, string> = { q: p.q, category: p.category, min: p.minText, max: p.maxText, sort: p.sort, page: String(p.page) };
  Object.assign(values, change);
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) {
    if (!v || (k === "sort" && v === "newest") || (k === "page" && v === "1")) continue;
    sp.set(k, v);
  }
  return `/products${sp.size ? `?${sp}` : ""}`;
}
