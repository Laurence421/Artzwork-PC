import { FilterPanel } from "@/features/customer/components/filter-panel";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProductCard } from "@/features/customer/components/product-card";
import { browse, browseHref, parseBrowseParams, SORTS, type BrowseParams } from "@/features/customer/lib/browse";
import { getShop, type ShopCategory } from "@/features/customer/queries/catalog";
import { Button } from "@/features/shared/ui/button";
import { secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { Select } from "@/features/shared/ui/select";
import { TextField } from "@/features/shared/ui/text-field";

export const metadata: Metadata = { title: "Products · Artzwork PC" };

export default function ProductsPage({ searchParams }: PageProps<"/products">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/products">["searchParams"] }) {
  const [raw, shop] = await Promise.all([searchParams, getShop()]);
  const p = parseBrowseParams(raw);
  if (!shop || shop.products.length === 0) return <p className="text-sm text-muted">No products yet. Check back soon.</p>;
  const result = browse(shop, p);
  const filtered = Boolean(p.q || p.category || p.minText || p.maxText);
  // A price that isn't a number is shown as an error, not silently ignored.
  const priceErrors = {
    min: p.minText && p.min === null ? "Enter a price, like 1500" : undefined,
    max: p.maxText && p.max === null ? "Enter a price, like 5000" : undefined,
  };
  const title = p.q ? `Results for “${p.q}”` : (result.category?.name ?? "All products");

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted">
          {result.total} {result.total === 1 ? "product" : "products"}
          {p.q && result.category ? ` in ${result.category.name}` : ""}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <Filters
          p={p}
          categories={shop.categories.filter((c) => c.productCount > 0 || c.slug === p.category)}
          filtered={filtered}
          priceErrors={priceErrors}
        />

        <div className="flex flex-col gap-6">
          {result.items.length > 0 ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {result.items.map((product, i) => (
                <ProductCard key={product.id} product={product} eager={i < 3} />
              ))}
            </ul>
          ) : (
            <section className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-surface p-6">
              <p className="text-sm text-muted">No products match.</p>
              {filtered && (
                <Link href="/products" className={secondaryButtonClasses("sm")}>
                  Clear filters
                </Link>
              )}
            </section>
          )}

          {result.pages > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-between gap-3">
              {result.page > 1 ? (
                <Link href={browseHref(p, { page: String(result.page - 1) })} className={secondaryButtonClasses("sm")}>
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              <p className="text-sm text-muted tabular-nums">
                Page {result.page} of {result.pages}
              </p>
              {result.page < result.pages ? (
                <Link href={browseHref(p, { page: String(result.page + 1) })} className={secondaryButtonClasses("sm")}>
                  Next →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>
      </div>
    </>
  );
}

/** Filters as a plain GET form, so they work without JavaScript and the URL can be shared. */
function Filters({
  p,
  categories,
  filtered,
  priceErrors,
}: {
  p: BrowseParams;
  categories: ShopCategory[];
  filtered: boolean;
  priceErrors: { min?: string; max?: string };
}) {
  return (
    <FilterPanel filtered={filtered}>
      <form action="/products" className="flex flex-col gap-4">
        <h2 className="hidden text-base font-semibold lg:block">Filter</h2>
        {p.q && <input type="hidden" name="q" value={p.q} />}
        <Select
          label="Category"
          name="category"
          defaultValue={p.category}
          options={[{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c.slug, label: c.name }))]}
        />
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Price</legend>
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Min" name="min" prefix="₱" inputMode="decimal" placeholder="0" defaultValue={p.minText} error={priceErrors.min} />
            <TextField label="Max" name="max" prefix="₱" inputMode="decimal" placeholder="Any" defaultValue={p.maxText} error={priceErrors.max} />
          </div>
        </fieldset>
        <Select label="Sort by" name="sort" defaultValue={p.sort} options={SORTS} />
        <Button>Apply</Button>
        {filtered && (
          <Link href="/products" className={secondaryButtonClasses("md")}>
            Clear filters
          </Link>
        )}
      </form>
    </FilterPanel>
  );
}
