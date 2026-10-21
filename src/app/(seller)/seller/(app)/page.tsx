import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoadingText } from "@/features/seller/components/loading-panel";
import { statusLabel } from "@/features/seller/components/order-status-badge";
import { SalesChart, type DailySales } from "@/features/seller/components/sales-chart";
import { Panel, PageHeader } from "@/features/seller/components/seller-shell";
import { StatCard } from "@/features/seller/components/stat-card";
import type { OrderStatus } from "@/features/seller/queries/orders";
import { getSellerStore } from "@/features/seller/queries/store";
import { formatPrice } from "@/features/shared/lib/money";
import { focusRingClasses } from "@/features/shared/ui/button-styles";

export const metadata: Metadata = { title: "Dashboard · Artzwork PC" };

type Summary = {
  today_sales: number;
  today_orders: number;
  month_sales: number;
  month_orders: number;
  pending_orders: number;
  daily: DailySales[];
  low_stock: { id: string; name: string; stock: number }[];
};

type RecentOrder = { id: string; order_no: number; created_at: string; total: number; status: OrderStatus; contact: { name: string }; shipping_option: { kind?: string } | null };

const when = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

// Seller site home ("/" on the seller host). The title is static; the numbers stream in.
export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Sales count paid, shipped and completed orders." />
      <Suspense fallback={<LoadingText />}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

async function DashboardContent() {
  const { supabase, store } = await getSellerStore();
  const [{ data: summary }, { data: recent }] = await Promise.all([
    supabase.rpc("store_sales_summary", { p_store_id: store.id }),
    supabase
      .from("orders")
      .select("id, order_no, created_at, total, status, contact, shipping_option")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<RecentOrder[]>(),
  ]);
  const s = summary as Summary | null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Today's sales" value={formatPrice(s?.today_sales ?? 0)} />
        <StatCard label="This month's sales" value={formatPrice(s?.month_sales ?? 0)} />
        <StatCard label="Orders today" value={String(s?.today_orders ?? 0)} />
        <StatCard label="Pending orders" value={String(s?.pending_orders ?? 0)} />
      </div>

      <Panel title="Sales, last 30 days">
        {s?.daily?.length ? <SalesChart daily={s.daily} /> : <p className="text-sm text-muted">No sales in the last 30 days yet.</p>}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Low stock">
          {s?.low_stock?.length ? (
            <ul className="flex flex-col text-sm">
              {s.low_stock.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
                  <Link href={`/products/${p.id}`} className={`truncate font-medium hover:underline ${focusRingClasses}`}>
                    {p.name}
                  </Link>
                  <span className="shrink-0 text-danger tabular-nums">{p.stock <= 0 ? "Sold out" : `${p.stock} left`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing is running low.</p>
          )}
        </Panel>

        <Panel title="Recent orders">
          {recent?.length ? (
            <ul className="flex flex-col text-sm">
              {recent.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
                  <span className="flex min-w-0 flex-col">
                    <Link href={`/orders/${o.id}`} className={`truncate font-medium hover:underline ${focusRingClasses}`}>
                      #{o.order_no} · {o.contact?.name}
                    </Link>
                    <span className="text-muted">
                      {when.format(new Date(o.created_at))} · {statusLabel(o.status, o.shipping_option?.kind === "pickup")}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatPrice(o.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No orders yet. They&apos;ll show here when customers check out.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
