import type { MetadataRoute } from "next";
import { getShop } from "@/features/customer/queries/catalog";

const SHOP = process.env.SHOP_URL ?? "http://localhost:3000";

// The shop's public pages for search engines: home, browse, info pages, each category and product.
// Cached with the catalog; it changes when the seller changes products.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const shop = await getShop();
  const pages = ["", "/products", "/about", "/contact", "/how-to-order"].map((path) => ({ url: `${SHOP}${path}` }));
  if (!shop) return pages;
  return [
    ...pages,
    ...shop.categories.filter((c) => c.productCount > 0).map((c) => ({ url: `${SHOP}/products?category=${encodeURIComponent(c.slug)}` })),
    ...shop.products.map((p) => ({ url: `${SHOP}/p/${p.slug}`, lastModified: p.createdAt })),
  ];
}
