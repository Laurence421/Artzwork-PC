import type { Metadata } from "next";

// Admin pages are never listed by search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Seller site (SELLER_HOST): served from ./seller/*; see src/lib/supabase/proxy.ts.
// Private to signed-in store members; code lives in src/features/seller.
export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
