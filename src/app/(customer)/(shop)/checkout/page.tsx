import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutForm } from "@/features/customer/components/checkout-form";
import { getCheckoutOptions } from "@/features/customer/queries/catalog";
import { getCheckoutProfile } from "@/features/customer/queries/account";

export const metadata: Metadata = { title: "Checkout · Artzwork PC" };

// Guests can check out; a signed-in customer's order is saved to their account.
export default function CheckoutPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <Checkout />
      </Suspense>
    </main>
  );
}

async function Checkout() {
  const [options, profile] = await Promise.all([getCheckoutOptions(), getCheckoutProfile()]);
  if (!options) return <p className="text-sm text-muted">Not taking orders yet.</p>;
  return <CheckoutForm options={options} profile={profile ?? undefined} />;
}
