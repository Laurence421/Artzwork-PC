import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingText } from "@/features/seller/components/loading-panel";
import { ProductForm } from "@/features/seller/components/product-form";
import { PageHeader } from "@/features/seller/components/seller-shell";
import { getProductOptions } from "@/features/seller/queries/products";
import { getSellerStore } from "@/features/seller/queries/store";

export const metadata: Metadata = { title: "Add product · Artzwork PC" };

export default function NewProductPage() {
  return (
    <>
      <PageHeader title="Add product" />
      <Suspense fallback={<LoadingText />}>
        <NewProductForm />
      </Suspense>
    </>
  );
}

async function NewProductForm() {
  const [{ store }, options] = await Promise.all([getSellerStore(), getProductOptions()]);
  return <ProductForm storeId={store.id} options={options} />;
}
