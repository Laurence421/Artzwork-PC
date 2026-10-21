import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoadingText } from "@/features/seller/components/loading-panel";
import { OrderStatusBadge, STATUS_LABEL } from "@/features/seller/components/order-status-badge";
import { QuickStatus } from "@/features/seller/components/quick-status";
import { PageHeader, Panel } from "@/features/seller/components/seller-shell";
import { listOrders, ORDER_LIST_LIMIT, ORDER_STATUSES, type OrderStatus } from "@/features/seller/queries/orders";
import { formatPrice } from "@/features/shared/lib/money";
import { focusRingClasses, secondaryButtonClasses } from "@/features/shared/ui/button-styles";

export const metadata: Metadata = { title: "Orders · Artzwork PC" };

const when = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

export default function OrdersPage({ searchParams }: PageProps<"/seller/orders">) {
  return (
    <>
      <PageHeader title="Orders" />
      <Suspense fallback={<LoadingText />}>
        <OrdersContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function OrdersContent({ searchParams }: { searchParams: PageProps<"/seller/orders">["searchParams"] }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const status = ORDER_STATUSES.find((s) => s === params.status);
  const { orders, more } = await listOrders({ status, q });

  const href = (s?: OrderStatus) => {
    const sp = new URLSearchParams();
    if (s) sp.set("status", s);
    if (q) sp.set("q", q);
    return `/orders${sp.size ? `?${sp}` : ""}`;
  };
  const exportHref = `/orders/export${href(status).replace("/orders", "")}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter orders" className="flex flex-wrap gap-1">
          {[undefined, ...ORDER_STATUSES].map((s) => (
            <Link
              key={s ?? "all"}
              href={href(s)}
              aria-current={s === status ? "page" : undefined}
              className={`flex h-9 items-center rounded-lg px-3 text-sm hover:bg-surface aria-[current=page]:bg-surface aria-[current=page]:font-medium ${focusRingClasses}`}
            >
              {s ? STATUS_LABEL[s] : "All"}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <form role="search" className="flex gap-2">
            {status && <input type="hidden" name="status" value={status} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Order # or customer"
              aria-label="Search orders"
              className="h-9 w-56 rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
            />
          </form>
          {orders.length > 0 && (
            <a href={exportHref} className={secondaryButtonClasses("sm")}>
              Export CSV
            </a>
          )}
        </div>
      </div>

      {more && (
        <p className="text-sm text-muted">
          Showing the newest {ORDER_LIST_LIMIT.toLocaleString("en-PH")} orders. Use the filters or search to find older ones.
        </p>
      )}

      {orders.length === 0 ? (
        q || status ? (
          <p className="text-sm text-muted">No orders match.</p>
        ) : (
          <Panel>
            <p className="text-sm text-muted">No orders yet. They&apos;ll show here when customers check out.</p>
          </Panel>
        )
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/orders/${o.id}`} className={`font-medium hover:underline ${focusRingClasses}`}>
                        #{o.orderNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{when.format(new Date(o.createdAt))}</td>
                    <td className="px-4 py-3">
                      <span className="flex flex-col">
                        <span>{o.customer}</span>
                        <span className="text-xs text-muted">{o.email}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">{o.payment}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPrice(o.total)}</td>
                    <td className="px-4 py-3">
                      <span className="flex flex-col items-start gap-1">
                        <OrderStatusBadge status={o.status} pickup={o.pickup} />
                        {o.status === "pending" && o.paymentRef && <span className="text-xs text-muted">Payment sent · check</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <QuickStatus orderId={o.id} orderNo={o.orderNo} status={o.status} pickup={o.pickup} paymentRef={o.paymentRef} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
                <Link href={`/orders/${o.id}`} className={`flex items-center justify-between gap-3 rounded-lg text-sm ${focusRingClasses}`}>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-medium">
                      #{o.orderNo} · {o.customer}
                    </span>
                    <span className="text-muted">{when.format(new Date(o.createdAt))}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums">{formatPrice(o.total)}</span>
                    <OrderStatusBadge status={o.status} pickup={o.pickup} />
                    {o.status === "pending" && o.paymentRef && <span className="text-xs text-muted">Payment sent · check</span>}
                  </span>
                </Link>
                <div className="hidden justify-end has-[>button]:flex">
                  <QuickStatus orderId={o.id} orderNo={o.orderNo} status={o.status} pickup={o.pickup} paymentRef={o.paymentRef} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
