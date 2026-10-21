import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoadingText } from "@/features/seller/components/loading-panel";
import { OrderStatusBadge } from "@/features/seller/components/order-status-badge";
import { PageHeader, Panel } from "@/features/seller/components/seller-shell";
import { StatCard } from "@/features/seller/components/stat-card";
import { getCustomer } from "@/features/seller/queries/customers";
import { formatPrice } from "@/features/shared/lib/money";
import { focusRingClasses } from "@/features/shared/ui/button-styles";

export const metadata: Metadata = { title: "Customer · Artzwork PC" };

const UUID = /^[0-9a-f-]{36}$/i;
const day = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const when = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

export default function CustomerPage({ params }: PageProps<"/seller/customers/[id]">) {
  return (
    <>
      <Link href="/customers" className={`self-start text-sm text-muted hover:underline ${focusRingClasses}`}>
        ← All customers
      </Link>
      <PageHeader title="Customer details" />
      <Suspense fallback={<LoadingText />}>
        <CustomerContent params={params} />
      </Suspense>
    </>
  );
}

async function CustomerContent({ params }: { params: PageProps<"/seller/customers/[id]">["params"] }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const c = await getCustomer(id);
  if (!c) notFound();

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-base font-semibold">{c.name}</p>
        <p className="text-sm text-muted">{c.hasAccount ? "Has a shop account" : "Ordered as a guest"}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Orders" value={String(c.orderCount)} />
        <StatCard label="Spent" value={formatPrice(c.spent)} />
        <StatCard label="First order" value={c.firstOrderAt ? day.format(new Date(c.firstOrderAt)) : "—"} />
        <StatCard label="Last order" value={c.lastOrderAt ? day.format(new Date(c.lastOrderAt)) : "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Panel title="Orders">
          {c.orders.length ? (
            <ul className="flex flex-col text-sm">
              {c.orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
                  <span className="flex min-w-0 flex-col">
                    <Link href={`/orders/${o.id}`} className={`font-medium hover:underline ${focusRingClasses}`}>
                      #{o.orderNo}
                    </Link>
                    <span className="text-muted">{when.format(new Date(o.createdAt))}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <OrderStatusBadge status={o.status} pickup={o.pickup} />
                    <span className="font-semibold tabular-nums">{formatPrice(o.total)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No orders.</p>
          )}
        </Panel>

        <Panel title="Contact">
          <div className="flex flex-col gap-1 text-sm">
            <a href={`mailto:${c.email}`} className={`text-primary hover:underline ${focusRingClasses}`}>
              {c.email}
            </a>
            <a href={`tel:${c.phone}`} className={`text-primary hover:underline ${focusRingClasses}`}>
              {c.phone}
            </a>
          </div>
        </Panel>
      </div>
    </>
  );
}
