import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddToCart } from "@/features/customer/components/add-to-cart";
import { ProductGallery } from "@/features/customer/components/product-gallery";
import { InstalmentNote } from "@/features/customer/components/shop-branding";
import { getShopProduct } from "@/features/customer/queries/catalog";
import { discountPercent, formatPrice } from "@/features/shared/lib/money";
import { Badge } from "@/features/shared/ui/badge";
import { focusRingClasses } from "@/features/shared/ui/button-styles";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const product = await getShopProduct((await params).slug);
  if (!product) return { title: "Product · Artzwork PC" };
  const price = formatPrice(product.salePrice ?? product.price);
  // What Google and a shared Facebook/Messenger link show: name, price, a short description, the first photo.
  const description = `${price}${product.soldOut ? " · Sold out" : ""}. ${product.description}`.replace(/\s+/g, " ").trim().slice(0, 160);
  return {
    title: `${product.name} · Artzwork PC`,
    description,
    alternates: { canonical: `/p/${product.slug}` },
    // A page's openGraph replaces the layout's, so the shared fields are repeated here.
    openGraph: {
      siteName: "Artzwork PC",
      type: "website",
      locale: "en_PH",
      title: product.name,
      description,
      url: `/p/${product.slug}`,
      ...(product.images[0] && { images: [{ url: product.images[0].url, alt: product.images[0].alt || product.name }] }),
    },
  };
}

export default function ProductPage({ params }: PageProps<"/p/[slug]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <Link href="/" className={`self-start text-sm text-muted hover:underline ${focusRingClasses}`}>
        ← All products
      </Link>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <ProductDetail params={params} />
      </Suspense>
    </main>
  );
}

async function ProductDetail({ params }: { params: PageProps<"/p/[slug]">["params"] }) {
  const product = await getShopProduct((await params).slug);
  if (!product) notFound();
  const pct = product.salePrice !== null ? discountPercent(product.price, product.salePrice) : 0;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <ProductGallery images={product.images} />

      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          {product.category && <p className="text-sm text-muted">{product.category}</p>}
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{product.name}</h1>
          {product.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {product.labels.map((l) => (
                <Badge key={l.text} text={l.text} color={l.color} />
              ))}
            </div>
          )}
        </header>

        <p className="flex flex-wrap items-baseline gap-2">
          <span className="font-display text-4xl font-bold tracking-tight tabular-nums">{formatPrice(product.salePrice ?? product.price)}</span>
          {product.salePrice !== null && (
            <>
              <span className="text-muted line-through tabular-nums">{formatPrice(product.price)}</span>
              {pct >= 1 && <span className="font-semibold text-primary">{pct}% off</span>}
            </>
          )}
        </p>

        <p className={`text-sm ${product.soldOut ? "text-danger" : "text-muted"}`}>
          {product.soldOut ? "Sold out" : `${product.stock} in stock`}
        </p>

        <InstalmentNote />

        <AddToCart productId={product.id} name={product.name} stock={product.soldOut ? 0 : product.stock} />

        {product.description && (
          <section className="flex flex-col gap-2 border-t border-border pt-6">
            <h2 className="text-base font-semibold">Description</h2>
            <p className="whitespace-pre-line text-sm text-muted">{product.description}</p>
          </section>
        )}
      </div>
    </div>
  );
}
