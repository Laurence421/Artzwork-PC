"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { focusRingClasses } from "@/features/shared/ui/button-styles";
import type { ShopCategory } from "../queries/catalog";

const chip = `flex h-9 shrink-0 items-center rounded-lg px-3 text-sm hover:bg-background aria-[current=page]:bg-background aria-[current=page]:font-medium ${focusRingClasses}`;

/** Category links under the nav bar; the current one is marked. Scrolls sideways on phones. */
export function CategoryNav({ categories }: { categories: ShopCategory[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname === "/products" ? (params.get("category") ?? "") : null;

  return (
    <nav aria-label="Categories" className="-mx-1 -my-1 flex min-w-0 gap-1 overflow-x-auto p-1">
      <Link href="/products" aria-current={current === "" ? "page" : undefined} className={chip}>
        All products
      </Link>
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/products?category=${encodeURIComponent(c.slug)}`}
          aria-current={current === c.slug ? "page" : undefined}
          className={chip}
        >
          {c.name}
        </Link>
      ))}
    </nav>
  );
}

/** Static version for the first paint (no "current" marking). */
export function CategoryNavFallback({ categories }: { categories: ShopCategory[] }) {
  return (
    <nav aria-label="Categories" className="-mx-1 -my-1 flex min-w-0 gap-1 overflow-x-auto p-1">
      <Link href="/products" className={chip}>
        All products
      </Link>
      {categories.map((c) => (
        <Link key={c.id} href={`/products?category=${encodeURIComponent(c.slug)}`} className={chip}>
          {c.name}
        </Link>
      ))}
    </nav>
  );
}

/** Search box in the nav bar: searches product names on /products. */
export function SearchBox() {
  const q = useSearchParams().get("q") ?? "";
  return <SearchForm defaultValue={q} key={q} />;
}

export function SearchForm({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form role="search" action="/products" className="w-full sm:w-64">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search products"
        aria-label="Search products"
        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
      />
    </form>
  );
}
