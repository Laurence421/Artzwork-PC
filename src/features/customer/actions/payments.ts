"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { sendStatusEmail } from "@/features/shared/lib/order-emails";
import { confirmSecret, createPaymentSession, getPaymongoSession, paymentProvider } from "@/features/shared/lib/payments";
import { createPublicClient } from "@/lib/supabase/public";

const TOKEN = /^[0-9a-f]{64}$/;

type OrderForPayment = {
  order_no: number;
  status: string;
  total: number;
  store: { name: string };
  payment_method: { type: string; label: string; online?: boolean };
  payment_session_id: string | null;
};

async function loadOrder(token: string) {
  const { data } = await createPublicClient().rpc("get_order_by_token", { p_token: token });
  return data as OrderForPayment | null;
}

/**
 * Starts an online payment (GCash, online banking) for a pending order and returns the
 * provider's page to send the customer to; null if the order can't be paid online now.
 */
export async function startPayment(token: string): Promise<string | null> {
  if (!TOKEN.test(token) || paymentProvider() === "off") return null;
  const order = await loadOrder(token);
  if (!order || order.status !== "pending" || !order.payment_method.online) return null;
  try {
    const session = await createPaymentSession({
      token,
      orderNo: order.order_no,
      total: order.total,
      methodType: order.payment_method.type,
      methodLabel: order.payment_method.label,
      storeName: order.store.name,
    });
    const { error } = await createPublicClient().rpc("attach_payment_session", { p_secret: confirmSecret(), p_token: token, p_session_id: session.id });
    if (error) throw new Error(error.message);
    return session.url;
  } catch (err) {
    console.error("Online payment could not start:", err);
    return null;
  }
}

export type PayNowState = { error?: string };

/** "Pay now" on the order page: off to the provider's page, or an error to show. */
export async function payNow(token: string): Promise<PayNowState> {
  const url = await startPayment(token);
  if (!url) return { error: "Online payment isn't available right now. Try again in a moment, or message the shop." };
  redirect(url);
}

/**
 * Back from the provider's page: ask the provider whether the session was paid and, if so, mark
 * the order paid (the provider's webhook does the same; whichever comes first wins).
 */
export async function syncPayment(token: string): Promise<void> {
  if (!TOKEN.test(token) || paymentProvider() !== "paymongo") return;
  const order = await loadOrder(token);
  if (!order || order.status !== "pending" || !order.payment_session_id) return;
  const result = await getPaymongoSession(order.payment_session_id);
  if (!result.paid) return;
  const { error } = await createPublicClient().rpc("confirm_online_payment", {
    p_secret: confirmSecret(),
    p_session_id: order.payment_session_id,
    p_amount: result.amount,
    p_ref: result.ref,
  });
  if (!error) {
    after(() => sendStatusEmail(token, null));
    refresh();
  }
}

/** The built-in test payment page's "Pay" button (local testing only; never takes money). */
export async function testPay(token: string, sessionId: string): Promise<void> {
  if (paymentProvider() !== "test" || !TOKEN.test(token)) redirect("/");
  const order = await loadOrder(token);
  if (order && order.status === "pending" && order.payment_session_id === sessionId) {
    await createPublicClient().rpc("confirm_online_payment", {
      p_secret: confirmSecret(),
      p_session_id: sessionId,
      p_amount: order.total,
      p_ref: `TEST-${randomBytes(4).toString("hex")}`,
    });
    after(() => sendStatusEmail(token, null));
  }
  redirect(`/order/${token}?paid=1`);
}
