import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoadingText } from "@/features/seller/components/loading-panel";
import { ProductTable } from "@/features/seller/components/product-table";
import { PageHeader, Panel } from "@/features/seller/components/seller-shell";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { listProducts, type ProductFilter } from "@/features/seller/queries/products";
import { buttonClasses, focusRingClasses } from "@/features/shared/ui/button-styles";

export const metadata: Metadata = { title: "Products · Artzwork PC" };

const FILTERS: { value: ProductFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "visible", label: "In shop" },
  { value: "hidden", label: "Hidden" },
  { value: "out", label: "Sold out" },
];

export default function ProductsPage({ searchParams }: PageProps<"/seller/products">) {
  return (
    <>
      <PageHeader
        title="Products"
        actions={
          <Link href="/products/new" className={buttonClasses("sm")}>
            Add product
          </Link>
        }
      />
      {/* Search, filter and the list depend on the URL and the database, so they stream in. */}
      <Suspense fallback={<LoadingText />}>
        <ProductsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ProductsContent({ searchParams }: { searchParams: PageProps<"/seller/products">["searchParams"] }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const filter = FILTERS.find((f) => f.value === params.filter)?.value ?? "all";
  const products = await listProducts({ q, filter });

  const href = (f: ProductFilter) => {
    const sp = new URLSearchParams();
    if (f !== "all") sp.set("filter", f);
    if (q) sp.set("q", q);
    return `/products${sp.size ? `?${sp}` : ""}`;
  };

  return (
    <>
      {params.saved === "1" && <FormAlert tone="success">Product saved.</FormAlert>}
      {params.deleted === "1" && <FormAlert tone="success">Product deleted.</FormAlert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter products" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={href(f.value)}
              aria-current={f.value === filter ? "page" : undefined}
              className={`flex h-9 items-center rounded-lg px-3 text-sm hover:bg-surface aria-[current=page]:bg-surface aria-[current=page]:font-medium ${focusRingClasses}`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <form role="search" className="flex gap-2">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search products"
            aria-label="Search products"
            className="h-9 w-56 rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
          />
        </form>
      </div>

      {products.length > 0 ? (
        <ProductTable products={products} />
      ) : q || filter !== "all" ? (
        <p className="text-sm text-muted">No products match.</p>
      ) : (
        <Panel>
          <p className="text-sm text-muted">No products yet. Add your first one and it shows in your shop right away.</p>
          <Link href="/products/new" className={`${buttonClasses("sm")} self-start`}>
            Add product
          </Link>
        </Panel>
      )}
    </>
  );
}
