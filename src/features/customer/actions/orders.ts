"use server";

import { after } from "next/server";
import { refresh, updateTag } from "next/cache";
import { CATALOG_TAG } from "@/features/shared/lib/cache-tags";
import { sendPaymentRefAlert, sendStatusEmail } from "@/features/shared/lib/order-emails";
import { getShop } from "../queries/catalog";
import { createClient } from "@/lib/supabase/server";

export type CancelOrderState = { error?: string };

/**
 * The customer cancels their order from its page, before it ships. cancel_order_by_token()
 * in the database allows it only while the order is placed or paid, and puts the stock back.
 */
export async function cancelMyOrder(token: string): Promise<CancelOrderState> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { error: "We couldn't find this order." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order_by_token", { p_token: token });
  if (error) {
    return {
      error:
        error.message === "CANNOT_CANCEL"
          ? "This order has already shipped, so it can't be cancelled. Contact the shop if you need help."
          : "We couldn't cancel your order. Try again.",
    };
  }
  // The stock is back, which the shop shows; the customer gets a confirmation email.
  updateTag(CATALOG_TAG);
  after(() => sendStatusEmail(token, null));
  refresh();
  return {};
}

/** Opening an order's page clears its "new update" mark; the nav badge refreshes if it changed. */
export async function markOrderSeen(token: string): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(token)) return;
  const { data } = await (await createClient()).rpc("mark_order_seen", { p_token: token });
  if (data === true) refresh();
}

export type PaymentRefState = { error?: string; fieldError?: string; value?: string; sent?: boolean };

/** The customer sends the reference number of their GCash or bank payment for the seller to match. */
export async function submitPaymentRef(token: string, _prev: PaymentRefState, formData: FormData): Promise<PaymentRefState> {
  const value = String(formData.get("ref") ?? "").trim();
  if (!/^[0-9a-f]{64}$/.test(token)) return { error: "We couldn't find this order.", value };
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{2,38}[A-Za-z0-9]$/.test(value)) {
    return { fieldError: "Enter the reference number from your receipt, like 1012 345 678901", value };
  }
  const { error } = await (await createClient()).rpc("submit_payment_ref", { p_token: token, p_ref: value });
  if (error) {
    return {
      error:
        error.message === "PAYMENT_REF_NOT_NEEDED"
          ? "This order doesn't need a payment reference any more. Reload the page to see its status."
          : "We couldn't send your reference. Try again.",
      value,
    };
  }
  // Tell the seller to check their GCash or bank app.
  after(async () => sendPaymentRefAlert(token, value.toUpperCase(), (await getShop())?.branding.contact.email || undefined));
  refresh();
  return { sent: true };
}
