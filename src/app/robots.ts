import type { MetadataRoute } from "next";

const SHOP = process.env.SHOP_URL ?? "http://localhost:3000";

// Search engines may list the shop's pages, but not carts, checkout, accounts or order links.
// The seller site is kept out by its own noindex (src/app/(seller)/layout.tsx).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/cart", "/checkout", "/account", "/orders", "/order/", "/login", "/signup", "/forgot-password", "/reset-password", "/auth/", "/pay/", "/api/"] },
    sitemap: `${SHOP}/sitemap.xml`,
  };
}
