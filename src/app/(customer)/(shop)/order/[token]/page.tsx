import type { Metadata } from "next";
import Image from "next/image";
import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CancelOrder } from "@/features/customer/components/cancel-order";
import { MarkOrderSeen } from "@/features/customer/components/mark-order-seen";
import { OnlinePayment } from "@/features/customer/components/online-payment";
import { PaymentRefForm } from "@/features/customer/components/payment-ref-form";
import { isPickup, trackingLink } from "@/features/shared/lib/couriers";
import { smsCheckEnabled } from "@/features/shared/lib/payment-sms-match";
import { isQrPh, qrPhWithAmount } from "@/features/shared/lib/qrph";
import { formatPrice } from "@/features/shared/lib/money";
import { publicImageUrl } from "@/features/shared/lib/storage";
import { secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { createPublicClient } from "@/lib/supabase/public";

export const metadata: Metadata = { title: "Your order · Artzwork PC", robots: { index: false } };

type Order = {
  order_no: number;
  status: "pending" | "paid" | "shipped" | "completed" | "cancelled";
  created_at: string;
  store: { name: string; address: string | null };
  contact: { name: string; email: string; phone: string };
  shipping_address: { recipient: string; phone: string; line1: string; line2?: string; barangay?: string; city: string; province: string; postal_code?: string };
  payment_method: { label: string; type: string; instructions?: string; account_name?: string; account_number?: string; qr_path?: string; online?: boolean; qr_payload?: string };
  payment_ref: string | null;
  pay_amount: number;
  shipping_option: { name: string; fee: number; kind?: string };
  courier: string | null;
  tracking_no: string | null;
  tracking_url: string | null;
  notes: string | null;
  subtotal: number;
  shipping_fee: number;
  total: number;
  items: { product_name: string; unit_price: number; quantity: number; line_total: number }[];
  events: { status: Order["status"]; note: string | null; created_at: string }[];
};

const STEPS = ["pending", "paid", "shipped", "completed"] as const;
const LABEL: Record<Order["status"], string> = {
  pending: "Order placed",
  paid: "Payment received",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
};
const when = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

// The tracking link from checkout. Anyone with the link can see the order; the token is unguessable.
export default function OrderPage(props: PageProps<"/order/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <OrderView {...props} />
      </Suspense>
    </main>
  );
}

async function OrderView({ params, searchParams }: PageProps<"/order/[token]">) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const { data } = await createPublicClient().rpc("get_order_by_token", { p_token: token });
  const order = data as Order | null;
  if (!order) notFound();

  const reached = new Set(order.events.map((e) => e.status));
  const pickup = isPickup(order.shipping_option);
  const pay = order.payment_method;
  // The seller's QR Ph with this order's exact amount filled in (a PNG, also offered as a download).
  const amountQr =
    order.status === "pending" && !pay.online && pay.qr_payload && isQrPh(pay.qr_payload)
      ? await QRCode.toDataURL(qrPhWithAmount(pay.qr_payload, order.pay_amount), { margin: 2, width: 384, errorCorrectionLevel: "M" })
      : null;
  const autoCheck = smsCheckEnabled(); // the shop's payment SMS confirm manual payments by themselves
  const label = (s: Order["status"]) => (pickup && s === "shipped" ? "Ready for pickup" : LABEL[s]);
  const track = trackingLink(order.courier, order.tracking_url);
  const sent = order.status === "shipped" || order.status === "completed";
  const a = order.shipping_address;

  return (
    <>
      <MarkOrderSeen token={token} />
      {sp.paid === "1" && pay.online && order.status !== "pending" && order.status !== "cancelled" && (
        <FormAlert tone="success" title={`Payment received for order #${order.order_no}.`}>
          Thank you! The shop will prepare your order. Bookmark this page to follow it.
        </FormAlert>
      )}
      {sp.new === "1" && (
        <FormAlert tone="success" title={`Thank you! Order #${order.order_no} is placed.`}>
          Bookmark this page to check your order&apos;s status any time.
        </FormAlert>
      )}

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Order #{order.order_no}</h1>
        <p className="text-sm text-muted">Placed {when.format(new Date(order.created_at))}</p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Status</h2>
        {order.status === "cancelled" ? (
          <p className="text-sm text-danger">This order was cancelled.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {STEPS.map((step) => {
              const event = order.events.find((e) => e.status === step);
              return (
                <li key={step} className="flex items-center gap-3 text-sm">
                  <span
                    aria-hidden="true"
                    className={`size-3 shrink-0 rounded-full ${reached.has(step) ? "bg-primary" : "border border-border"}`}
                  />
                  <span className={reached.has(step) ? "font-medium" : "text-muted"}>{label(step)}</span>
                  {event && <span className="ml-auto text-muted">{when.format(new Date(event.created_at))}</span>}
                </li>
              );
            })}
          </ol>
        )}
        <CancelOrder token={token} orderNo={order.order_no} status={order.status} />
      </section>

      {sent && pickup && (
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 text-sm">
          <h2 className="text-base font-semibold">{order.status === "completed" ? "Picked up" : "Ready for pickup"}</h2>
          {order.store.address ? (
            <p className="whitespace-pre-line">Pick up your order at {order.store.name}: {order.store.address}</p>
          ) : (
            <p>Your order is ready. Contact {order.store.name} for where to pick it up.</p>
          )}
          <p className="text-muted">Bring your order number, #{order.order_no}.</p>
        </section>
      )}

      {sent && !pickup && (order.courier || order.tracking_no || track) && (
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 text-sm">
          <h2 className="text-base font-semibold">Your parcel</h2>
          <div className="flex flex-col gap-1">
            {order.courier && <p>Shipped via {order.courier}</p>}
            {order.tracking_no && (
              <p>
                Tracking number: <span className="font-semibold tabular-nums">{order.tracking_no}</span>
              </p>
            )}
          </div>
          {track && (
            <a href={track} target="_blank" rel="noopener noreferrer" className={`${secondaryButtonClasses("sm")} self-start`}>
              Track parcel<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </section>
      )}

      {order.status === "pending" && pay.online && (
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 text-sm">
          <h2 className="text-base font-semibold">Pay online</h2>
          <OnlinePayment token={token} label={pay.label} amount={formatPrice(order.total)} returned={sp.paid === "1" || sp.paid === "0" ? sp.paid : undefined} />
        </section>
      )}
      {order.status === "pending" && !pay.online && pay.type !== "cod" && (
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 text-sm">
          <h2 className="text-base font-semibold">How to pay</h2>
          {order.pay_amount > order.total ? (
            // The few extra centavos make this order's amount unique, so the shop's payment SMS
            // can be matched to it and the order marked paid by itself.
            <div className="flex flex-col gap-1">
              <p>Pay exactly, by {pay.label}:</p>
              <p className="text-2xl font-semibold tabular-nums">{formatPrice(order.pay_amount)}</p>
              <p className="text-muted">
                That&apos;s your total plus {formatPrice(order.pay_amount - order.total)}, so the shop can confirm your payment automatically. Paying a
                different amount means the shop has to check it by hand.
              </p>
            </div>
          ) : (
            <p>
              Pay <span className="font-semibold tabular-nums">{formatPrice(order.total)}</span> by {pay.label}.
            </p>
          )}
          {pay.account_name && <p>Account name: {pay.account_name}</p>}
          {pay.account_number && <p>Account number: <span className="tabular-nums">{pay.account_number}</span></p>}
          {pay.instructions && <p className="whitespace-pre-line text-muted">{pay.instructions}</p>}
          {amountQr ? (
            // The seller's own QR with this order's exact amount already in it.
            <div className="flex flex-col items-start gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- a generated data: image, nothing to optimise */}
              <img
                src={amountQr}
                alt={`${pay.label} QR code for ${formatPrice(order.pay_amount)}, amount already filled in`}
                width={192}
                height={192}
                className="size-48 rounded-lg border border-border bg-white"
              />
              <p className="text-muted">Scan with GCash, Maya or your bank app: the amount is already filled in.</p>
              <a href={amountQr} download={`order-${order.order_no}-${pay.type}-qr.png`} className={`${secondaryButtonClasses("sm")} self-start`}>
                Save QR image
              </a>
              <p className="text-muted">On this phone? Save the QR, then in your app tap QR &rarr; Upload QR and pick it.</p>
            </div>
          ) : (
            pay.qr_path && (
              <div className="relative size-48 overflow-hidden rounded-lg border border-border bg-white">
                <Image src={publicImageUrl(pay.qr_path)} alt={`${pay.label} QR code`} fill sizes="192px" className="object-contain" />
              </div>
            )
          )}
          <p className="text-muted">
            Put <span className="font-medium text-foreground">Order #{order.order_no}</span> in the message or note when you send it.
          </p>
          <PaymentRefForm token={token} current={order.payment_ref} optional={autoCheck && order.pay_amount > order.total} />
        </section>
      )}

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Items</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {order.items.map((i, n) => (
            <li key={n} className="flex justify-between gap-4">
              <span>
                {i.quantity} × {i.product_name}
              </span>
              <span className="tabular-nums">{formatPrice(i.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1 border-t border-border pt-4 text-sm">
          <p className="flex justify-between">
            <span className="text-muted">Subtotal</span>
            <span className="tabular-nums">{formatPrice(order.subtotal)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-muted">{pickup ? "Pickup" : "Delivery"} ({order.shipping_option.name})</span>
            <span className="tabular-nums">{order.shipping_fee === 0 ? "Free" : formatPrice(order.shipping_fee)}</span>
          </p>
          <p className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatPrice(order.total)}</span>
          </p>
        </div>
      </section>

      <section className="grid gap-6 rounded-2xl border border-border bg-surface p-6 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">{pickup ? "Pick up at" : "Deliver to"}</h2>
          {pickup ? (
            <p className="whitespace-pre-line">{order.store.address || order.store.name}</p>
          ) : (
          <div className="flex flex-col gap-1">
          <p>{a.recipient}</p>
          <p>{[a.line1, a.line2].filter(Boolean).join(", ")}</p>
          <p>{[a.barangay, a.city, a.province, a.postal_code].filter(Boolean).join(", ")}</p>
          <p className="text-muted">{a.phone}</p>
          </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-semibold">Payment</h2>
            <p>{pay.label}</p>
          </div>
          {order.notes && (
            <div className="flex flex-col gap-4">
              <h2 className="text-base font-semibold">Your notes</h2>
              <p className="whitespace-pre-line text-muted">{order.notes}</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
