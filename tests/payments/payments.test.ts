import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { createPaymentSession, paymentProvider, sessionResult, verifyPaymongoSignature } = await import("@/features/shared/lib/payments");

const order = { token: "b".repeat(64), orderNo: 1007, total: 1836000, methodType: "gcash", methodLabel: "GCash", storeName: "Artzwork PC" };

beforeEach(() => {
  vi.stubEnv("PAYMENT_CONFIRM_SECRET", "x".repeat(64));
  vi.stubEnv("SHOP_URL", "https://shop.example.com");
  vi.stubEnv("PAYMONGO_SECRET_KEY", "");
  vi.stubEnv("PAYMONGO_BANK_METHODS", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("which provider", () => {
  it("uses PayMongo with keys, the test page locally without them, and nothing without the secret", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(paymentProvider()).toBe("test");
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_123");
    expect(paymentProvider()).toBe("paymongo");
    vi.stubEnv("PAYMENT_CONFIRM_SECRET", "");
    expect(paymentProvider()).toBe("off");
  });

  it("never offers the test page in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(paymentProvider()).toBe("off");
  });
});

describe("PayMongo checkout session", () => {
  it("asks PayMongo for a GCash checkout of the order total and returns its page", async () => {
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_123");
    let request: { url: string; headers: Record<string, string>; body: { data: { attributes: Record<string, unknown> } } } | null = null;
    vi.stubGlobal("fetch", async (url: string, init: { headers: Record<string, string>; body: string }) => {
      request = { url, headers: init.headers, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ data: { id: "cs_abc", attributes: { checkout_url: "https://checkout.paymongo.com/cs_abc" } } }), { status: 200 });
    });

    const session = await createPaymentSession(order);
    expect(session).toEqual({ id: "cs_abc", url: "https://checkout.paymongo.com/cs_abc" });
    const r = request!;
    expect(r.url).toBe("https://api.paymongo.com/v1/checkout_sessions");
    expect(r.headers.Authorization).toBe(`Basic ${Buffer.from("sk_test_123:").toString("base64")}`);
    const a = r.body.data.attributes;
    expect(a.payment_method_types).toEqual(["gcash"]);
    expect(a.line_items).toEqual([{ currency: "PHP", amount: 1836000, name: "Artzwork PC order #1007", quantity: 1 }]);
    expect(a.success_url).toBe(`https://shop.example.com/order/${order.token}?paid=1`);
    expect(a.cancel_url).toBe(`https://shop.example.com/order/${order.token}?paid=0`);
  });

  it("offers online banking for bank methods (configurable)", async () => {
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_123");
    const types: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      types.push(JSON.parse(init.body).data.attributes.payment_method_types);
      return new Response(JSON.stringify({ data: { id: "cs_1", attributes: { checkout_url: "https://x" } } }), { status: 200 });
    });
    await createPaymentSession({ ...order, methodType: "bank_transfer" });
    vi.stubEnv("PAYMONGO_BANK_METHODS", "dob, brankas_bdo");
    await createPaymentSession({ ...order, methodType: "bank_transfer" });
    expect(types).toEqual([["dob", "dob_ubp"], ["dob", "brankas_bdo"]]);
  });

  it("fails loudly when PayMongo refuses, so the order page can offer Pay now again", async () => {
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_123");
    vi.stubGlobal("fetch", async () => new Response("bad key", { status: 401 }));
    await expect(createPaymentSession(order)).rejects.toThrow("PayMongo checkout failed: 401");
  });

  it("uses the built-in test page without keys", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const session = await createPaymentSession(order);
    expect(session.id).toMatch(/^test_/);
    expect(session.url).toBe(`https://shop.example.com/pay/test/${order.token}?session=${session.id}`);
  });
});

describe("reading a session and checking webhooks", () => {
  it("finds the paid payment in a session", () => {
    expect(sessionResult({ id: "cs_1", attributes: { payments: [{ id: "pay_1", attributes: { status: "paid", amount: 1836000 } }] } })).toEqual({
      paid: true,
      amount: 1836000,
      ref: "pay_1",
    });
    expect(sessionResult({ id: "cs_1", attributes: { payments: [] } }).paid).toBe(false);
    expect(sessionResult({ id: "cs_1", attributes: {} }).paid).toBe(false);
  });

  it("accepts only correctly signed, recent webhooks", () => {
    const secret = "whsk_test";
    const body = JSON.stringify({ data: { id: "evt_1" } });
    const t = 1_800_000_000;
    const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    const now = t * 1000;
    expect(verifyPaymongoSignature(body, `t=${t},te=${sig},li=`, secret, now)).toBe(true);
    expect(verifyPaymongoSignature(body, `t=${t},te=,li=${sig}`, secret, now)).toBe(true);
    expect(verifyPaymongoSignature(body + " ", `t=${t},te=${sig},li=`, secret, now)).toBe(false); // body changed
    expect(verifyPaymongoSignature(body, `t=${t},te=${sig},li=`, "other", now)).toBe(false); // wrong secret
    expect(verifyPaymongoSignature(body, `t=${t},te=${sig},li=`, secret, now + 600_000)).toBe(false); // too old
    expect(verifyPaymongoSignature(body, null, secret, now)).toBe(false);
    expect(verifyPaymongoSignature(body, `t=${t},te=${sig}`, "", now)).toBe(false); // no secret configured
  });
});
