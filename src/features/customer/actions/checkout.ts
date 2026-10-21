"use server";

import { updateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { CATALOG_TAG } from "@/features/shared/lib/cache-tags";
import { sendNewOrderAlert, sendOrderPlacedEmail } from "@/features/shared/lib/order-emails";
import { createClient } from "@/lib/supabase/server";
import { getShop } from "../queries/catalog";
import { startPayment } from "./payments";

export type CheckoutFields = "name" | "email" | "phone" | "ship_recipient" | "ship_phone" | "ship_line1" | "ship_city" | "ship_province" | "payment" | "shipping";

export type CheckoutState = {
  error?: string;
  /** A cart item that is short or gone, so the form can name it. */
  productId?: string;
  fieldErrors?: Partial<Record<CheckoutFields, string>>;
  /** What was typed, so the form shows it again after React resets it. */
  values?: Record<string, string>;
  /** Set once the order exists: the client clears the cart, then opens the order page. */
  trackingToken?: string;
  /** Online payment (GCash, online banking): the provider's page to send the customer to. */
  payUrl?: string;
};

const required = (msg: string, max = 200) => z.string().trim().min(1, { error: msg }).max(max);

const schema = z.object({
  storeSlug: z.string().min(1),
  items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).min(1).max(50),
  name: required("Enter your name", 100),
  email: z.email({ error: "Enter a valid email" }).or(z.literal("")),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+()\-\s]{7,20}$/, { error: "Enter a phone number, like 0917 123 4567" }),
  recipient: z.string().trim().max(100),
  shipPhone: z
    .string()
    .trim()
    .regex(/^$|^[0-9+()\-\s]{7,20}$/, { error: "Enter a phone number, like 0917 123 4567" }),
  label: z.string().trim().max(40),
  line1: required("Enter your house no. and street"),
  line2: z.string().trim().max(200),
  barangay: z.string().trim().max(100),
  city: required("Enter your city or municipality", 100),
  province: required("Enter your province", 100),
  postalCode: z.string().trim().max(10),
  payment: z.string().uuid({ error: "Choose how you'll pay" }),
  shipping: z.string().uuid({ error: "Choose a delivery option" }),
  notes: z.string().trim().max(1000),
});

// Database errors (supabase/migrations/..._functions.sql place_order) -> words for the customer.
const MESSAGES: Record<string, string> = {
  OUT_OF_STOCK: "Not enough stock for one of your items. Lower the quantity or remove it.",
  PRODUCT_UNAVAILABLE: "One of your items is no longer sold. Remove it from your cart.",
  QUANTITY_INVALID: "Check the quantities in your cart.",
  CART_EMPTY: "Your cart is empty.",
  CART_TOO_LARGE: "Your cart has too many different items. Split it into two orders.",
  CONTACT_INVALID: "Check your name, email and phone.",
  ADDRESS_INVALID: "Check your delivery address.",
  PAYMENT_METHOD_INVALID: "That payment method isn't available any more. Choose another.",
  SHIPPING_OPTION_INVALID: "That delivery option isn't available any more. Choose another.",
  STORE_NOT_FOUND: "The shop isn't taking orders right now.",
  // Spam limits (supabase/migrations/..._hardening.sql).
  TOO_MANY_ORDERS: "You already have several unpaid orders from the last hour. Pay for one or wait a little before ordering again.",
  SHOP_BUSY: "The shop is getting a lot of orders right now. Please try again in a few minutes.",
};

/** What a store-pickup order keeps in place of a delivery address. */
const PICKUP = "Store pickup";

export async function placeOrder(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const str = (k: string) => String(formData.get(k) ?? "");
  const values = Object.fromEntries(
    ["name", "email", "phone", "notes", ...["label", "recipient", "phone", "line1", "line2", "barangay", "city", "province", "postalCode"].map((k) => `ship_${k}`)].map((k) => [k, str(k)]),
  );
  // The server client carries the session, so a signed-in customer's order is linked to their account.
  const supabase = await createClient();
  // Store pickup needs no delivery address. The kind is read from the database, never trusted from the form.
  const shippingId = str("shipping");
  const { data: option } = /^[0-9a-f-]{36}$/i.test(shippingId)
    ? await supabase.from("shipping_options").select("kind").eq("id", shippingId).maybeSingle()
    : { data: null };
  const pickup = option?.kind === "pickup";
  const addr = (k: string) => (pickup ? "" : str(`ship_${k}`));

  let items: unknown = [];
  try {
    items = JSON.parse(str("items") || "[]");
  } catch {
    items = [];
  }

  const parsed = schema.safeParse({
    storeSlug: str("storeSlug"),
    items,
    name: str("name"),
    email: str("email"),
    phone: str("phone"),
    recipient: addr("recipient"),
    shipPhone: addr("phone"),
    label: addr("label"),
    // The order keeps an address snapshot either way; for pickup it just says so.
    line1: pickup ? PICKUP : str("ship_line1"),
    line2: addr("line2"),
    barangay: addr("barangay"),
    city: pickup ? PICKUP : str("ship_city"),
    province: pickup ? PICKUP : str("ship_province"),
    postalCode: addr("postalCode"),
    payment: str("payment"),
    shipping: str("shipping"),
    notes: str("notes"),
  });

  if (!parsed.success) {
    const f = z.flattenError(parsed.error).fieldErrors;
    const fieldErrors = {
      name: f.name?.[0],
      email: f.email?.[0],
      phone: f.phone?.[0],
      ship_phone: f.shipPhone?.[0],
      ship_line1: f.line1?.[0],
      ship_city: f.city?.[0],
      ship_province: f.province?.[0],
      payment: f.payment?.[0],
      shipping: f.shipping?.[0],
    };
    const marked = Object.values(fieldErrors).some(Boolean);
    return { error: marked ? "Fix the fields marked in red." : MESSAGES.CART_EMPTY, fieldErrors, values };
  }
  const v = parsed.data;

  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub && !v.email) {
    return { error: "Fix the fields marked in red.", fieldErrors: { email: "Enter your email so we can send your order details" }, values };
  }

  const { data, error } = await supabase
    .rpc("place_order", {
      p_store_slug: v.storeSlug,
      p_items: v.items,
      p_contact: { name: v.name, email: v.email, phone: v.phone },
      p_address: {
        recipient: v.recipient || v.name,
        phone: v.shipPhone || v.phone,
        line1: v.line1,
        line2: v.line2,
        barangay: v.barangay,
        city: v.city,
        province: v.province,
        postal_code: v.postalCode,
      },
      p_payment_method_id: v.payment,
      p_shipping_option_id: v.shipping,
      p_notes: v.notes || null,
    })
    .single<{ order_no: number; tracking_token: string }>();

  if (error || !data) {
    const code = error?.message ?? "";
    return { error: MESSAGES[code] ?? "We couldn't place your order. Try again.", productId: error?.details || undefined, values };
  }

  // Signed in and asked to: keep the address for next time (the first one becomes the default).
  if (auth?.claims?.sub && !pickup && formData.get("saveAddress") === "on") {
    const { count } = await supabase.from("customer_addresses").select("id", { count: "exact", head: true });
    await supabase.from("customer_addresses").insert({
      label: v.label || (count ? `Address ${count + 1}` : "Home"),
      recipient: v.recipient || v.name,
      phone: v.shipPhone || v.phone,
      line1: v.line1,
      line2: v.line2 || null,
      barangay: v.barangay || null,
      city: v.city,
      province: v.province,
      postal_code: v.postalCode || null,
      is_default: !count,
    });
  }

  // Stock changed: the shop's cached pages must show it.
  updateTag(CATALOG_TAG);
  // Confirmation email after the response, so a slow mail service never slows checkout.
  const token = data.tracking_token;
  // After the response: the customer's confirmation, and the seller's "New order" alert.
  after(async () => {
    const shopEmail = (await getShop())?.branding.contact.email || undefined;
    await Promise.all([sendOrderPlacedEmail(token, shopEmail), sendNewOrderAlert(token, shopEmail)]);
  });
  // Online payment method: start the payment now, so the customer goes straight to GCash or their bank.
  // If it can't start, the order page offers "Pay now" to try again.
  const { data: method } = await supabase.from("payment_methods").select("online").eq("id", v.payment).maybeSingle();
  const payUrl = method?.online ? ((await startPayment(token)) ?? undefined) : undefined;
  return { trackingToken: token, payUrl };
}
