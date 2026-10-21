import type { Metadata } from "next";
import { ArrowRight, PackageSearch, ShieldCheck, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { ProductCard } from "@/features/customer/components/product-card";
import { HomeHero } from "@/features/customer/components/shop-branding";
import { getShop, type ShopProduct } from "@/features/customer/queries/catalog";
import { focusRingClasses } from "@/features/shared/ui/button-styles";

export const metadata: Metadata = { title: "Shop · Artzwork PC" };

// What every order gets, under the hero.
const PERKS = [
  { icon: Truck, title: "Delivered to you", text: "By courier, or pick up at the shop" },
  { icon: Wallet, title: "Pay your way", text: "GCash, bank transfer or cash on delivery" },
  { icon: PackageSearch, title: "Track every order", text: "See its status and parcel online" },
  { icon: ShieldCheck, title: "Safe checkout", text: "Cancel any time before it ships" },
];

const NEW_ARRIVALS = 8;
const PER_CATEGORY = 4;

function Row({ title, href, products, eagerFirst = false }: { title: string; href: string; products: ShopProduct[]; eagerFirst?: boolean }) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-2xl font-bold tracking-tight uppercase md:text-3xl">{title}</h2>
        <Link href={href} className={`group inline-flex items-center gap-1 text-sm font-medium text-primary ${focusRingClasses}`}>
          View all <ArrowRight aria-hidden className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product, i) => (
          <ProductCard key={product.id} product={product} eager={eagerFirst && i < 4} />
        ))}
      </ul>
    </section>
  );
}

// Shop home: open to everyone, no login needed. New arrivals, then a row per category.
export default async function ShopHomePage() {
  const shop = await getShop();
  const products = shop?.products ?? [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-8 md:gap-16">
      <HomeHero />
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PERKS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-3 rounded-2xl border border-border bg-surface/70 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Icon aria-hidden className="size-5" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{title}</span>
              <span className="text-xs text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ul>
      {products.length === 0 ? (
        <p className="text-sm text-muted">No products yet. Check back soon.</p>
      ) : (
        <>
          <Row title="New arrivals" href="/products" products={products.slice(0, NEW_ARRIVALS)} eagerFirst />
          {shop!.categories.map((c) => {
            const inCategory = products.filter((p) => p.categoryId === c.id).slice(0, PER_CATEGORY);
            return inCategory.length ? (
              <Row key={c.id} title={c.name} href={`/products?category=${encodeURIComponent(c.slug)}`} products={inCategory} />
            ) : null;
          })}
        </>
      )}
    </main>
  );
}
