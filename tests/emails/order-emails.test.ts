import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The email module is server-only and reads the order through Supabase; both are replaced here,
// and Resend's API is replaced by a fetch that records what would be sent.
vi.mock("server-only", () => ({}));
const order = {
  order_no: 1007,
  status: "pending",
  store: { name: "Artzwork PC", address: null },
  contact: { name: "Juan <b>Dela Cruz</b>", email: "juan@example.com" },
  payment_method: { type: "gcash", label: "GCash", account_name: "Shop", account_number: "0000 000 0000" },
  shipping_option: { name: "Standard delivery", kind: "delivery" },
  subtotal: 1836000,
  shipping_fee: 0,
  total: 1836000,
  items: [{ product_name: "Ryzen 5 PC", quantity: 1, line_total: 1836000 }],
};
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => ({ rpc: async () => ({ data: order }) }) }));

const { sendNewOrderAlert, sendPaymentRefAlert, sendOrderPlacedEmail } = await import("@/features/shared/lib/order-emails");

type Sent = { to: string[]; subject: string; html: string; text: string; reply_to?: string };
let sent: Sent[] = [];
const TOKEN = "a".repeat(64);

beforeEach(() => {
  sent = [];
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "Artzwork PC <orders@example.com>");
  vi.stubEnv("SELLER_URL", "https://admin.example.com");
  vi.stubEnv("SHOP_URL", "https://shop.example.com");
  vi.stubEnv("ORDER_ALERT_EMAIL", "");
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    return new Response("{}", { status: 200 });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("seller alerts", () => {
  it("emails the shop's contact address about a new order, with total, payment and a link to Orders", async () => {
    await sendNewOrderAlert(TOKEN, "owner@example.com");
    expect(sent).toHaveLength(1);
    const [m] = sent;
    expect(m.to).toEqual(["owner@example.com"]);
    expect(m.subject).toBe("Artzwork PC: New order #1007: ₱18,360.00");
    expect(m.text).toContain("Payment: GCash");
    expect(m.html).toContain("https://admin.example.com/orders");
    // Customer-typed text is escaped, never raw HTML.
    expect(m.html).toContain("Juan &lt;b&gt;Dela Cruz&lt;/b&gt;");
    expect(m.html).not.toContain("<b>Dela Cruz</b>");
  });

  it("prefers ORDER_ALERT_EMAIL, and sends nothing when there is no inbox", async () => {
    vi.stubEnv("ORDER_ALERT_EMAIL", "alerts@example.com");
    await sendNewOrderAlert(TOKEN, "owner@example.com");
    expect(sent[0].to).toEqual(["alerts@example.com"]);

    vi.stubEnv("ORDER_ALERT_EMAIL", "");
    sent = [];
    await sendNewOrderAlert(TOKEN, undefined);
    expect(sent).toHaveLength(0);
  });

  it("tells the seller a payment reference arrived, with the reference and the pending orders link", async () => {
    await sendPaymentRefAlert(TOKEN, "1012 345 678901", "owner@example.com");
    const [m] = sent;
    expect(m.subject).toBe("Artzwork PC: Payment sent for order #1007 (1012 345 678901)");
    expect(m.html).toContain("Reference: <strong>1012 345 678901</strong>");
    expect(m.html).toContain("https://admin.example.com/orders?status=pending");
  });
});

describe("customer emails still work", () => {
  it("sends the order confirmation to the customer with the tracking link", async () => {
    await sendOrderPlacedEmail(TOKEN, "owner@example.com");
    const [m] = sent;
    expect(m.to).toEqual(["juan@example.com"]);
    expect(m.reply_to).toBe("owner@example.com");
    expect(m.text).toContain(`https://shop.example.com/order/${TOKEN}`);
    expect(m.html).toContain("View your order");
  });

  it("sends nothing while email is switched off (no Resend key)", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await sendNewOrderAlert(TOKEN, "owner@example.com");
    await sendOrderPlacedEmail(TOKEN);
    expect(sent).toHaveLength(0);
  });
});
