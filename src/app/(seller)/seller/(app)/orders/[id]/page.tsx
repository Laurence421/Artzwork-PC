import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoadingText } from "@/features/seller/components/loading-panel";
import { OrderActions } from "@/features/seller/components/order-actions";
import { OrderStatusBadge } from "@/features/seller/components/order-status-badge";
import { PrintButton } from "@/features/seller/components/print-button";
import { PageHeader, Panel } from "@/features/seller/components/seller-shell";
import { getOrder } from "@/features/seller/queries/orders";
import { isPickup, trackingLink } from "@/features/shared/lib/couriers";
import { formatPrice } from "@/features/shared/lib/money";
import { focusRingClasses } from "@/features/shared/ui/button-styles";

export const metadata: Metadata = { title: "Order · Artzwork PC" };

const UUID = /^[0-9a-f-]{36}$/i;
const when = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

export default function OrderDetailPage({ params }: PageProps<"/seller/orders/[id]">) {
  return (
    <>
      <Link href="/orders" className={`self-start text-sm text-muted hover:underline print:hidden ${focusRingClasses}`}>
        ← All orders
      </Link>
      <PageHeader title="Order details" actions={<PrintButton label="Print summary" />} />
      <Suspense fallback={<LoadingText />}>
        <OrderContent params={params} />
      </Suspense>
    </>
  );
}

async function OrderContent({ params }: { params: PageProps<"/seller/orders/[id]">["params"] }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const order = await getOrder(id);
  if (!order) notFound();
  const a = order.address;
  const shopUrl = process.env.SHOP_URL;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-base font-semibold">Order #{order.orderNo}</p>
        <OrderStatusBadge status={order.status} pickup={isPickup(order.shipping)} />
        <p className="text-sm text-muted">Placed {when.format(new Date(order.createdAt))}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Panel title="Items">
            <ul className="flex flex-col text-sm">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-4 border-b border-border py-2 last:border-0">
                  <span className="min-w-0">
                    {i.productId ? (
                      <Link href={`/products/${i.productId}`} className={`font-medium hover:underline ${focusRingClasses}`}>
                        {i.name}
                      </Link>
                    ) : (
                      i.name
                    )}
                    <span className="text-muted tabular-nums">
                      {" "}
                      · {i.quantity} × {formatPrice(i.unitPrice)}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatPrice(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-1 border-t border-border pt-4 text-sm">
              <p className="flex justify-between">
                <span className="text-muted">Subtotal</span>
                <span className="tabular-nums">{formatPrice(order.subtotal)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted">Delivery ({order.shipping.name})</span>
                <span className="tabular-nums">{order.shippingFee === 0 ? "Free" : formatPrice(order.shippingFee)}</span>
              </p>
              <p className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatPrice(order.total)}</span>
              </p>
            </div>
          </Panel>

          <Panel title="History">
            <ol className="flex flex-col gap-3 text-sm">
              {order.events.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <OrderStatusBadge status={e.status} pickup={isPickup(order.shipping)} />
                    <span className="text-muted">{when.format(new Date(e.createdAt))}</span>
                  </span>
                  {e.note && <span className="text-muted">{e.note}</span>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <div className="print:hidden">
            <Panel title="Update status">
              <OrderActions orderId={order.id} orderNo={order.orderNo} status={order.status} pickup={isPickup(order.shipping)} paymentRef={order.paymentRef} />
            </Panel>
          </div>

          <Panel title="Customer">
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-medium">{order.contact.name}</p>
              <a href={`mailto:${order.contact.email}`} className={`text-primary hover:underline ${focusRingClasses}`}>
                {order.contact.email}
              </a>
              <a href={`tel:${order.contact.phone}`} className={`text-primary hover:underline ${focusRingClasses}`}>
                {order.contact.phone}
              </a>
              <Link href={`/customers/${order.customerId}`} className={`text-primary hover:underline print:hidden ${focusRingClasses}`}>
                All orders from this customer
              </Link>
            </div>
          </Panel>

          <Panel title="Delivery">
            <div className="flex flex-col gap-1 text-sm">
              {isPickup(order.shipping) ? (
                <p>The customer picks this order up at the shop.</p>
              ) : (
                <>
                  <p>{a.recipient}</p>
                  <p>{[a.line1, a.line2].filter(Boolean).join(", ")}</p>
                  <p>{[a.barangay, a.city, a.province, a.postal_code].filter(Boolean).join(", ")}</p>
                  <p className="text-muted">{a.phone}</p>
                </>
              )}
              <p className="text-muted">{order.shipping.name}{isPickup(order.shipping) ? " (store pickup)" : ""}</p>
              {order.courier && (
                <p>
                  {order.courier}
                  {order.trackingNo && <span className="tabular-nums"> · {order.trackingNo}</span>}
                </p>
              )}
              {trackingLink(order.courier, order.trackingUrl) && (
                <a href={trackingLink(order.courier, order.trackingUrl)!} target="_blank" rel="noreferrer" className={`text-primary hover:underline print:hidden ${focusRingClasses}`}>
                  Track parcel
                  <span className="text-muted"> (opens in a new tab)</span>
                </a>
              )}
            </div>
          </Panel>

          <Panel title="Payment">
            <div className="flex flex-col gap-1 text-sm">
              <p>{order.payment.label}</p>
              <p className="text-muted">{order.status === "pending" ? "Not paid yet" : order.status === "cancelled" ? "Order cancelled" : "Paid"}</p>
              {order.payAmount > order.total && (
                <p>
                  Asked to pay exactly <span className="font-semibold tabular-nums">{formatPrice(order.payAmount)}</span>
                  <span className="text-muted"> (so your payment SMS can be matched to it automatically)</span>
                </p>
              )}
              {order.paymentRef && (
                <p>
                  Reference: <span className="font-semibold tabular-nums">{order.paymentRef}</span>
                  {order.paymentRefAt && <span className="text-muted"> · sent {when.format(new Date(order.paymentRefAt))}</span>}
                </p>
              )}
            </div>
          </Panel>

          {order.notes && (
            <Panel title="Customer's notes">
              <p className="whitespace-pre-line text-sm text-muted">{order.notes}</p>
            </Panel>
          )}

          {shopUrl && (
            <p className="text-sm print:hidden">
              <a href={`${shopUrl}/order/${order.trackingToken}`} target="_blank" rel="noreferrer" className={`text-primary hover:underline ${focusRingClasses}`}>
                View the customer&apos;s tracking page
                <span className="text-muted"> (opens in a new tab)</span>
              </a>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
