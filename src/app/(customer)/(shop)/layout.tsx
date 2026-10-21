import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandingProvider } from "@/features/customer/branding/branding-context";
import { ShopHeader } from "@/features/customer/components/shop-header";
import { AnnouncementBar, ChatButton, ShopFooter } from "@/features/customer/components/shop-branding";
import { getShop } from "@/features/customer/queries/catalog";
import { resolveBranding } from "@/features/shared/lib/branding";

/** The seller's favicon, and how shared links look on Facebook and other apps, for every shop page. */
export async function generateMetadata(): Promise<Metadata> {
  const b = (await getShop())?.branding;
  if (!b) return {};
  const image = b.bannerUrl ?? b.logoUrl;
  return {
    ...(b.faviconUrl && { icons: { icon: b.faviconUrl } }),
    ...(b.tagline && { description: b.tagline }),
    openGraph: { siteName: b.name, type: "website", locale: "en_PH", ...(b.tagline && { description: b.tagline }), ...(image && { images: [image] }) },
  };
}

// Shop pages: announcement, nav bar, page, footer, all in the seller's branding.
// Login and sign-up sit outside this group with their own frame.
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const shop = await getShop(); // cached until the seller changes the catalog or branding
  const branding = shop?.branding ?? resolveBranding({ name: "Artzwork PC", tagline: null, branding: {}, theme: {} }, () => "");

  return (
    <BrandingProvider initial={branding} previewOrigin={process.env.SELLER_URL}>
      <AnnouncementBar />
      <ShopHeader categories={(shop?.categories ?? []).filter((c) => c.productCount > 0)} />
      {children}
      <ShopFooter />
      {/* It reads the URL (hidden on cart and checkout), so it streams in after the page. */}
      <Suspense fallback={null}>
        <ChatButton />
      </Suspense>
    </BrandingProvider>
  );
}
