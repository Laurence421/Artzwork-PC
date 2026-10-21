import type { Metadata } from "next";
import Link from "next/link";
import { getCheckoutOptions } from "@/features/customer/queries/catalog";
import { formatPrice } from "@/features/shared/lib/money";
import { buttonClasses } from "@/features/shared/ui/button-styles";

export const metadata: Metadata = { title: "How to order · Artzwork PC" };

const STEPS = [
  { title: "Pick your items", text: "Open a product, choose how many, and tap Add to cart, or Order now to go straight to checkout." },
  { title: "Check out", text: "Enter your name, mobile number and delivery address, then choose how to pay and how it's delivered." },
  { title: "Pay", text: "" },
  { title: "Track it", text: "Your order page shows each step: placed, paid, shipped and completed. Bookmark it, or log in to see all your orders." },
];

// Steps, plus the payment methods and delivery options the seller has turned on in Settings.
export default async function HowToOrderPage() {
  const options = await getCheckoutOptions(); // cached with the catalog
  const types = new Set(options?.payments.map((p) => p.type));
  const pay = [
    types.has("cod") && "Cash on delivery: pay the courier when it arrives.",
    (types.has("gcash") || types.has("bank_transfer")) &&
      `${[types.has("gcash") && "GCash", types.has("bank_transfer") && "Bank transfer"].filter(Boolean).join(" or ")}: your order page shows how to pay.`,
  ].filter(Boolean) as string[];
  const steps = STEPS.map((s) => (s.title === "Pay" ? { ...s, text: pay.join(" ") || "Choose a payment method at checkout." } : s));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">How to order</h1>
        <p className="text-sm text-muted">Four steps, no account needed.</p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Steps</h2>
        <ol className="flex flex-col gap-4 text-sm">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-medium">{s.title}</span>
                <span className="text-muted">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 text-sm">
          <h2 className="text-base font-semibold">Ways to pay</h2>
          {options?.payments.length ? (
            <ul className="flex flex-col gap-3">
              {options.payments.map((p) => (
                <li key={p.id} className="flex flex-col gap-1">
                  <span className="font-medium">{p.label}</span>
                  {p.instructions && <span className="text-muted">{p.instructions}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Not taking orders yet.</p>
          )}
        </section>
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 text-sm">
          <h2 className="text-base font-semibold">Delivery</h2>
          {options?.shipping.length ? (
            <ul className="flex flex-col gap-3">
              {options.shipping.map((s) => (
                <li key={s.id} className="flex justify-between gap-4">
                  <span className="flex flex-col gap-1">
                    <span className="font-medium">{s.name}</span>
                    {s.description && <span className="text-muted">{s.description}</span>}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{s.fee === 0 ? "Free" : formatPrice(s.fee)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Not taking orders yet.</p>
          )}
        </section>
      </div>

      <Link href="/products" className={`${buttonClasses("sm")} self-start`}>
        Start shopping
      </Link>
    </main>
  );
}
