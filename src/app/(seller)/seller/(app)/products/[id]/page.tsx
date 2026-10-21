import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoadingText } from "@/features/seller/components/loading-panel";
import { DeleteProductButton } from "@/features/seller/components/delete-product-button";
import { ProductForm } from "@/features/seller/components/product-form";
import { PageHeader, Panel } from "@/features/seller/components/seller-shell";
import { getProduct, getProductOptions } from "@/features/seller/queries/products";
import { getSellerStore } from "@/features/seller/queries/store";

export const metadata: Metadata = { title: "Edit product · Artzwork PC" };

const UUID = /^[0-9a-f-]{36}$/i;

export default function EditProductPage({ params }: PageProps<"/seller/products/[id]">) {
  return (
    <>
      <PageHeader title="Edit product" />
      <Suspense fallback={<LoadingText />}>
        <EditProductContent params={params} />
      </Suspense>
    </>
  );
}

async function EditProductContent({ params }: { params: PageProps<"/seller/products/[id]">["params"] }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [{ store }, product, options] = await Promise.all([getSellerStore(), getProduct(id), getProductOptions()]);
  if (!product) notFound();

  return (
    <>
      <ProductForm storeId={store.id} product={product} options={options} />
      <Panel title="Delete product">
        <p className="text-sm text-muted">Removes it from your shop and this list. Past orders keep their own copy.</p>
        <DeleteProductButton productId={product.id} name={product.name} />
      </Panel>
    </>
  );
}
