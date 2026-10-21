import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { testPay } from "@/features/customer/actions/payments";
import { formatPrice } from "@/features/shared/lib/money";
import { paymentProvider } from "@/features/shared/lib/payments";
import { Button } from "@/features/shared/ui/button";
import { secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { createPublicClient } from "@/lib/supabase/public";

export const metadata: Metadata = { title: "Test payment", robots: { index: false } };

// Stands in for GCash / online banking while the shop has no PayMongo keys, so checkout can be
// tried end to end on a computer. Only in development, never with real keys, never takes money.
export default function TestPaymentPage(props: PageProps<"/pay/test/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <TestPayment {...props} />
      </Suspense>
    </main>
  );
}

type Order = { order_no: number; status: string; total: number; store: { name: string }; payment_method: { label: string }; payment_session_id: string | null };

async function TestPayment({ params, searchParams }: PageProps<"/pay/test/[token]">) {
  if (paymentProvider() !== "test") notFound();
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const session = typeof sp.session === "string" ? sp.session : "";
  if (!/^[0-9a-f]{64}$/.test(token) || !session) notFound();
  const { data } = await createPublicClient().rpc("get_order_by_token", { p_token: token });
  const order = data as Order | null;
  if (!order || order.payment_session_id !== session) notFound();

  return (
    <>
      <p className="rounded-lg border border-border bg-surface px-3 py-2 text-center text-sm font-medium">
        TEST PAYMENT PAGE · no real money moves. With PayMongo keys set, customers see the real {order.payment_method.label} page here.
      </p>
      <section className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6">
        <header className="flex flex-col gap-1">
          <p className="text-sm text-muted">{order.payment_method.label}</p>
          <h1 className="text-2xl font-semibold tracking-tight tabular-nums">{formatPrice(order.total)}</h1>
          <p className="text-sm text-muted">
            {order.store.name} · order #{order.order_no}
          </p>
        </header>
        {order.status === "pending" ? (
          <form action={testPay.bind(null, token, session)} className="flex flex-col gap-2">
            <Button pendingLabel="Paying…">Pay {formatPrice(order.total)}</Button>
            <Link href={`/order/${token}?paid=0`} className={`${secondaryButtonClasses("md")}`}>
              Cancel
            </Link>
          </form>
        ) : (
          <Link href={`/order/${token}`} className={secondaryButtonClasses("md")}>
            Already paid · back to the order
          </Link>
        )}
      </section>
    </>
  );
}
