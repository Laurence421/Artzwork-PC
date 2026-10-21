import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandingForm } from "@/features/seller/components/branding-form";
import { LoadingText } from "@/features/seller/components/loading-panel";
import { PageHeader } from "@/features/seller/components/seller-shell";
import { getBrandingForEdit } from "@/features/seller/queries/branding";
import { getSellerStore } from "@/features/seller/queries/store";

export const metadata: Metadata = { title: "Branding · Artzwork PC" };

export default function BrandingPage() {
  return (
    <>
      <PageHeader title="Branding" description="Your shop's name, images, colours and contact details." />
      <Suspense fallback={<LoadingText />}>
        <BrandingContent />
      </Suspense>
    </>
  );
}

async function BrandingContent() {
  const [{ store }, initial] = await Promise.all([getSellerStore(), getBrandingForEdit()]);
  return <BrandingForm storeId={store.id} initial={initial} shopUrl={process.env.SHOP_URL} />;
}
