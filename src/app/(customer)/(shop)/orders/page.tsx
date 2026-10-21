import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { listMyOrders } from "@/features/customer/queries/account";
import { formatPrice } from "@/features/shared/lib/money";
import { buttonClasses, focusRingClasses } from "@/features/shared/ui/button-styles";
import { OrderStatusBadge } from "@/features/shared/ui/order-status-badge";

export const metadata: Metadata = { title: "My orders · Artzwork PC" };

const when = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

export default function MyOrdersPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">My orders</h1>
        <p className="text-sm text-muted">Open an order to see its status, how to pay, or to cancel it before it ships.</p>
      </header>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <MyOrders />
      </Suspense>
    </main>
  );
}

async function MyOrders() {
  const orders = await listMyOrders();
  if (orders.length === 0) {
    return (
      <section className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-surface p-6">
        <p className="text-sm text-muted">No orders yet. Orders you place while logged in, or with this email, show here.</p>
        <Link href="/products" className={buttonClasses("sm")}>
          Browse products
        </Link>
      </section>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/order/${o.trackingToken}`} className={`flex items-center justify-between gap-4 p-4 text-sm hover:bg-background ${focusRingClasses}`}>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2 font-medium">
                Order #{o.orderNo}
                {o.hasUpdate && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">New update</span>
                )}
              </span>
              <span className="text-muted">
                {when.format(new Date(o.createdAt))} · {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-semibold tabular-nums">{formatPrice(o.total)}</span>
              <OrderStatusBadge status={o.status} pickup={o.pickup} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
