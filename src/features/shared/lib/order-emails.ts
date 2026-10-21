import "server-only";
import { escapeHtml, sendEmail } from "@/lib/email";
import { createPublicClient } from "@/lib/supabase/public";
import { isPickup, trackingLink } from "./couriers";
import { formatPrice } from "./money";

// Order emails to customers: one when the order is placed, one for each later status.
// Data comes from get_order_by_token, the same function the tracking page uses.

type Status = "pending" | "paid" | "shipped" | "completed" | "cancelled";
type OrderForEmail = {
  order_no: number;
  status: Status;
  store: { name: string; address?: string | null };
  contact: { name: string; email: string };
  payment_method: { type: string; label: string; instructions?: string; account_name?: string; account_number?: string };
  shipping_option: { name: string; kind?: string };
  courier?: string | null;
  tracking_no?: string | null;
  tracking_url?: string | null;
  subtotal: number;
  shipping_fee: number;
  total: number;
  pay_amount?: number;
  items: { product_name: string; quantity: number; line_total: number }[];
};

const HEADLINE: Record<Exclude<Status, "pending">, string> = {
  paid: "We've received your payment",
  shipped: "Your order is on its way",
  completed: "Your order is complete",
  cancelled: "Your order was cancelled",
};

async function loadOrder(token: string): Promise<OrderForEmail | null> {
  const { data } = await createPublicClient().rpc("get_order_by_token", { p_token: token });
  return (data as OrderForEmail | null) ?? null;
}

function trackingUrl(token: string) {
  return `${process.env.SHOP_URL ?? ""}/order/${token}`;
}

/** A plain, readable email layout (no images, works in every mail app). */
function layout(
  store: string,
  title: string,
  bodyHtml: string,
  link: string,
  { button = "View your order", footer = `You're getting this because you ordered from ${escapeHtml(store)}. Reply to this email if you have a question.` } = {},
) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f8;font-family:Arial,Helvetica,sans-serif;color:#111827">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:14px;font-weight:bold;margin:0 0 16px">${escapeHtml(store)}</p>
<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
${bodyHtml}
<p style="margin:24px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">${escapeHtml(button)}</a></p>
</div>
<p style="font-size:12px;color:#6b7280;margin:16px 0 0">${footer}</p>
</div></body></html>`;
}

function itemsHtml(o: OrderForEmail) {
  const rows = o.items
    .map(
      (i) =>
        `<tr><td style="padding:4px 0">${i.quantity} × ${escapeHtml(i.product_name)}</td><td style="padding:4px 0;text-align:right">${formatPrice(i.line_total)}</td></tr>`,
    )
    .join("");
  return `<table style="width:100%;font-size:14px;border-collapse:collapse">${rows}
<tr><td style="padding:8px 0 0;border-top:1px solid #e5e7eb;color:#6b7280">Delivery (${escapeHtml(o.shipping_option.name)})</td><td style="padding:8px 0 0;border-top:1px solid #e5e7eb;text-align:right">${o.shipping_fee === 0 ? "Free" : formatPrice(o.shipping_fee)}</td></tr>
<tr><td style="padding:4px 0;font-weight:bold">Total</td><td style="padding:4px 0;text-align:right;font-weight:bold">${formatPrice(o.total)}</td></tr></table>`;
}

function howToPay(o: OrderForEmail) {
  const p = o.payment_method;
  if (p.type === "cod") return `<p style="font-size:14px">Payment: ${escapeHtml(p.label)}. Pay the courier when your order arrives.</p>`;
  const lines = [
    o.pay_amount && o.pay_amount > o.total
      ? `Pay exactly <strong>${formatPrice(o.pay_amount)}</strong> by ${escapeHtml(p.label)} (your total plus ${formatPrice(o.pay_amount - o.total)}, so your payment is confirmed automatically).`
      : `Pay <strong>${formatPrice(o.total)}</strong> by ${escapeHtml(p.label)}.`,
    p.account_name && `Account name: ${escapeHtml(p.account_name)}`,
    p.account_number && `Account number: ${escapeHtml(p.account_number)}`,
    p.instructions && escapeHtml(p.instructions),
  ].filter(Boolean);
  return `<div style="font-size:14px;background:#f4f5f8;border-radius:8px;padding:12px;margin:16px 0">${lines.map((l) => `<p style="margin:4px 0">${l}</p>`).join("")}</div>`;
}

/** After checkout: confirmation with items, total, how to pay and the tracking link. */
export async function sendOrderPlacedEmail(token: string, replyTo?: string) {
  const o = await loadOrder(token);
  if (!o?.contact?.email) return;
  const link = trackingUrl(token);
  const title = `Thank you! Order #${o.order_no} is placed.`;
  await sendEmail({
    to: o.contact.email,
    replyTo,
    subject: `${o.store.name}: order #${o.order_no} received`,
    html: layout(o.store.name, title, `<p style="font-size:14px">Hi ${escapeHtml(o.contact.name)}, we've got your order.</p>${howToPay(o)}${itemsHtml(o)}`, link),
    text: `${title}\n\nTotal: ${formatPrice(o.total)}\nPayment: ${o.payment_method.label}\n\nTrack your order: ${link}`,
  });
}

/** After the seller changes the status: what changed, plus the seller's note. */
export async function sendStatusEmail(token: string, note: string | null, replyTo?: string) {
  const o = await loadOrder(token);
  if (!o?.contact?.email || o.status === "pending") return;
  const link = trackingUrl(token);
  const pickup = isPickup(o.shipping_option);
  const headline = pickup && o.status === "shipped" ? "Your order is ready for pickup" : HEADLINE[o.status];
  const title = `${headline} (order #${o.order_no})`;
  const noteHtml = note ? `<p style="font-size:14px;background:#f4f5f8;border-radius:8px;padding:12px">${escapeHtml(note)}</p>` : "";
  const extra =
    o.status === "cancelled"
      ? "If you didn't ask for this, reply to this email."
      : o.status === "shipped"
        ? pickup
          ? `Pick it up at ${o.store.address || o.store.name}. Bring your order number.`
          : [o.courier ? `It's with ${o.courier} now.` : "It's with the courier now.", o.tracking_no && `Tracking number: ${o.tracking_no}.`].filter(Boolean).join(" ")
        : "Thank you for shopping with us.";
  const track = o.status === "shipped" && !pickup ? trackingLink(o.courier, o.tracking_url) : null;
  const trackHtml = track ? `<p style="font-size:14px"><a href="${escapeHtml(track)}" style="color:#4f46e5">Track your parcel</a></p>` : "";
  await sendEmail({
    to: o.contact.email,
    replyTo,
    subject: `${o.store.name}: ${title}`,
    html: layout(o.store.name, title, `<p style="font-size:14px">Hi ${escapeHtml(o.contact.name)}. ${escapeHtml(extra)}</p>${trackHtml}${noteHtml}`, link),
    text: `${title}\n${extra}${track ? `\nTrack your parcel: ${track}` : ""}${note ? `\n\nNote from the shop: ${note}` : ""}\n\nYour order: ${link}`,
  });
}

// Alerts for the seller ------------------------------------------------------------------

/** Who gets the seller's alerts: ORDER_ALERT_EMAIL, else the shop's contact email (Branding). */
function sellerInbox(contactEmail?: string) {
  return process.env.ORDER_ALERT_EMAIL || contactEmail || "";
}

const SELLER_FOOTER = "You're getting this because you run this shop. Order alerts go to ORDER_ALERT_EMAIL, or the contact email in Branding.";

/** A new order came in: number, customer, total, payment and items, with a link to the admin Orders list. */
export async function sendNewOrderAlert(token: string, contactEmail?: string) {
  const to = sellerInbox(contactEmail);
  const o = await loadOrder(token);
  if (!to || !o) return;
  const link = `${process.env.SELLER_URL ?? ""}/orders`;
  const title = `New order #${o.order_no}: ${formatPrice(o.total)}`;
  const who = `${escapeHtml(o.contact.name)} · ${escapeHtml(o.contact.email || "")}`;
  await sendEmail({
    to,
    subject: `${o.store.name}: ${title}`,
    html: layout(
      o.store.name,
      title,
      `<p style="font-size:14px">${who}<br>Payment: ${escapeHtml(o.payment_method.label)} · Delivery: ${escapeHtml(o.shipping_option.name)}</p>${itemsHtml(o)}`,
      link,
      { button: "Open Orders", footer: SELLER_FOOTER },
    ),
    text: `${title}\n${o.contact.name} (${o.contact.email})\nPayment: ${o.payment_method.label}\nDelivery: ${o.shipping_option.name}\n\nOrders: ${link}`,
  });
}

/** The customer sent the reference number of their GCash or bank payment: time to check and mark it paid. */
export async function sendPaymentRefAlert(token: string, ref: string, contactEmail?: string) {
  const to = sellerInbox(contactEmail);
  const o = await loadOrder(token);
  if (!to || !o) return;
  const link = `${process.env.SELLER_URL ?? ""}/orders?status=pending`;
  const title = `Payment sent for order #${o.order_no}`;
  await sendEmail({
    to,
    subject: `${o.store.name}: ${title} (${ref})`,
    html: layout(
      o.store.name,
      title,
      `<p style="font-size:14px">${escapeHtml(o.contact.name)} says they paid <strong>${formatPrice(o.total)}</strong> by ${escapeHtml(o.payment_method.label)}.</p><p style="font-size:14px;background:#f4f5f8;border-radius:8px;padding:12px">Reference: <strong>${escapeHtml(ref)}</strong></p><p style="font-size:14px">Find it in your ${escapeHtml(o.payment_method.label)} app, then mark the order as paid.</p>`,
      link,
      { button: "Open pending orders", footer: SELLER_FOOTER },
    ),
    text: `${title}\n${o.contact.name} says they paid ${formatPrice(o.total)} by ${o.payment_method.label}.\nReference: ${ref}\n\nPending orders: ${link}`,
  });
}
