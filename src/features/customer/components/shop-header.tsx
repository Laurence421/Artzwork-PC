import Link from "next/link";
import { Suspense } from "react";
import { buttonClasses, secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { createClient } from "@/lib/supabase/server";
import type { ShopCategory } from "../queries/catalog";
import { CategoryNav, CategoryNavFallback, SearchBox, SearchForm } from "./browse-nav";
import { CartLink } from "./cart-link";
import { ShopBrand } from "./shop-branding";

/**
 * Nav bar on every shop page: logo and name, cart, then Log in, or My orders and My account; under it the
 * category menu and the search box.
 */
export function ShopHeader({ categories }: { categories: ShopCategory[] }) {
  return (
    // Sticky, blurred glass bar: the shop stays one tap away while scrolling.
    <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <ShopBrand />
        <div className="flex shrink-0 items-center gap-2">
          <CartLink />
          {/* Sign-in state is per visitor, so it streams in; signed out is the static shell. */}
          <Suspense fallback={<LoginLink />}>
            <AccountAction />
          </Suspense>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-col-reverse gap-2 px-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Which category is open and what was searched come from the URL, so they stream in. */}
        <Suspense fallback={<CategoryNavFallback categories={categories} />}>
          <CategoryNav categories={categories} />
        </Suspense>
        <Suspense fallback={<SearchForm />}>
          <SearchBox />
        </Suspense>
      </div>
    </header>
  );
}

function LoginLink() {
  return (
    <Link href="/login" className={buttonClasses("sm")}>
      Log in
    </Link>
  );
}

async function AccountAction() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return <LoginLink />;

  // Orders whose status changed since the customer last opened them (paid, shipped, ...).
  const { data: unseen } = await supabase.rpc("my_unseen_order_count");
  const news = typeof unseen === "number" ? unseen : 0;

  return (
    <>
      <Link
        href="/orders"
        className={`${secondaryButtonClasses("sm")} gap-2`}
        aria-label={news > 0 ? `My orders, ${news} new ${news === 1 ? "update" : "updates"}` : "My orders"}
      >
        {/* "My" only from tablet width up, so Cart, Orders and Account fit a phone bar. */}
        <span>
          <span className="hidden sm:inline">My&nbsp;</span>Orders
        </span>
        {news > 0 && (
          <span className="min-w-5 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
            {news}
          </span>
        )}
      </Link>
      <Link href="/account/profile" className={buttonClasses("sm")} aria-label="My account">
        <span className="hidden sm:inline">My&nbsp;</span>Account
      </Link>
    </>
  );
}
