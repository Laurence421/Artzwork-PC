import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// Online payments: the customer pays on the provider's page (GCash, online banking), and the
// order becomes paid when the provider confirms. Two providers:
// - "paymongo": real payments, when PAYMONGO_SECRET_KEY is set (https://paymongo.com).
// - "test": a built-in test payment page, only outside production and only without PayMongo keys,
//   so the whole flow can be tried locally. It never takes money.
// Either way the database only accepts a confirmation from this server (PAYMENT_CONFIRM_SECRET).

export type Provider = "paymongo" | "test" | "off";

export function paymentProvider(): Provider {
  if (!process.env.PAYMENT_CONFIRM_SECRET) return "off";
  if (process.env.PAYMONGO_SECRET_KEY) return "paymongo";
  return process.env.NODE_ENV === "production" ? "off" : "test";
}

export function confirmSecret() {
  return process.env.PAYMENT_CONFIRM_SECRET ?? "";
}

const SHOP = () => process.env.SHOP_URL ?? "http://localhost:3000";

// What PayMongo calls each kind of method. Online banking depends on what the account has
// switched on, so it can be changed with PAYMONGO_BANK_METHODS (comma-separated).
function methodTypes(type: string): string[] {
  if (type === "gcash") return ["gcash"];
  return (process.env.PAYMONGO_BANK_METHODS || "dob,dob_ubp").split(",").map((s) => s.trim()).filter(Boolean);
}

export type NewSession = { id: string; url: string };

/** Starts a payment for an order; the customer is sent to `url`. */
export async function createPaymentSession(order: {
  token: string;
  orderNo: number;
  total: number;
  methodType: string;
  methodLabel: string;
  storeName: string;
}): Promise<NewSession> {
  const back = `${SHOP()}/order/${order.token}`;
  if (paymentProvider() === "test") {
    const id = `test_${randomUUID()}`;
    return { id, url: `${SHOP()}/pay/test/${order.token}?session=${id}` };
  }

  const res = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
    method: "POST",
    headers: { Authorization: paymongoAuth(), "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [{ currency: "PHP", amount: order.total, name: `${order.storeName} order #${order.orderNo}`, quantity: 1 }],
          payment_method_types: methodTypes(order.methodType),
          description: `${order.storeName} order #${order.orderNo}`,
          reference_number: String(order.orderNo),
          send_email_receipt: false,
          show_line_items: true,
          success_url: `${back}?paid=1`,
          cancel_url: `${back}?paid=0`,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`PayMongo checkout failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data: { id: string; attributes: { checkout_url: string } } };
  return { id: json.data.id, url: json.data.attributes.checkout_url };
}

export type SessionResult = { paid: boolean; amount: number; ref: string };

/** Asks PayMongo whether a session has been paid (used when the customer comes back). */
export async function getPaymongoSession(id: string): Promise<SessionResult> {
  const res = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(id)}`, {
    headers: { Authorization: paymongoAuth() },
    cache: "no-store",
  });
  if (!res.ok) return { paid: false, amount: 0, ref: "" };
  const json = (await res.json()) as PaymongoSession;
  return sessionResult(json.data);
}

type PaymongoPayment = { id: string; attributes: { status: string; amount: number } };
type PaymongoSessionData = { id: string; attributes: { payments?: PaymongoPayment[]; payment_intent?: { attributes?: { status?: string } } } };
type PaymongoSession = { data: PaymongoSessionData };

export function sessionResult(session: PaymongoSessionData): SessionResult {
  const payment = session.attributes.payments?.find((p) => p.attributes.status === "paid");
  return payment ? { paid: true, amount: payment.attributes.amount, ref: payment.id } : { paid: false, amount: 0, ref: "" };
}

/**
 * Checks the Paymongo-Signature header ("t=<time>,te=<test sig>,li=<live sig>"): an HMAC-SHA256 of
 * "<time>.<raw body>" with the webhook's secret. Rejects anything older than 5 minutes.
 */
export function verifyPaymongoSignature(rawBody: string, header: string | null, secret: string, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  return [parts.te, parts.li].some((sig) => typeof sig === "string" && sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

function paymongoAuth() {
  return `Basic ${Buffer.from(`${process.env.PAYMONGO_SECRET_KEY ?? ""}:`).toString("base64")}`;
}
