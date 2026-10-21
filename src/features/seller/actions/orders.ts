"use server";

import { refresh, updateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { CATALOG_TAG } from "@/features/shared/lib/cache-tags";
import { sendStatusEmail } from "@/features/shared/lib/order-emails";
import { getLatestOrder, type LatestOrder } from "../queries/orders";
import { getSellerStore } from "../queries/store";

export type StatusFormState = {
  error?: string;
  message?: string;
  fieldErrors?: { trackingUrl?: string };
  /** What was typed, sent back after a failed save so the form keeps it. */
  values?: { courier: string; trackingNo: string; trackingUrl: string; note: string };
};

const LABEL: Record<string, string> = { paid: "paid", shipped: "shipped", completed: "completed", cancelled: "cancelled" };

/**
 * Moves an order to its next status through update_order_status() in the database,
 * which allows only pending→paid|cancelled, paid→shipped|cancelled, shipped→completed,
 * puts stock back on cancel, and records the change in the order's history.
 */
export async function changeOrderStatus(orderId: string, _prev: StatusFormState, formData: FormData): Promise<StatusFormState> {
  const { supabase } = await getSellerStore();
  const parsed = z
    .object({
      status: z.enum(["paid", "shipped", "completed", "cancelled"]),
      note: z.string().trim().max(500, { error: "Keep the note under 500 characters" }),
      courier: z.string().trim().max(40),
      trackingNo: z.string().trim().max(60),
      trackingUrl: z.union([z.literal(""), z.url({ protocol: /^https$/, error: "Paste a link that starts with https://" }).max(500)]),
    })
    .safeParse({
      status: formData.get("status"),
      note: String(formData.get("note") ?? ""),
      courier: String(formData.get("courier") ?? ""),
      trackingNo: String(formData.get("trackingNo") ?? ""),
      trackingUrl: String(formData.get("trackingUrl") ?? "").trim(),
    });
  const values = {
    courier: String(formData.get("courier") ?? ""),
    trackingNo: String(formData.get("trackingNo") ?? ""),
    trackingUrl: String(formData.get("trackingUrl") ?? ""),
    note: String(formData.get("note") ?? ""),
  };
  if (!parsed.success) {
    const url = z.flattenError(parsed.error).fieldErrors.trackingUrl?.[0];
    return url ? { error: "Fix the fields marked in red.", fieldErrors: { trackingUrl: url }, values } : { error: "Choose what to do with this order.", values };
  }
  const v = parsed.data;

  // Shipping goes through ship_order(), which also saves the courier and tracking details.
  const { data: updated, error } =
    v.status === "shipped"
      ? await supabase.rpc("ship_order", { p_order_id: orderId, p_courier: v.courier, p_tracking_no: v.trackingNo, p_tracking_url: v.trackingUrl, p_note: v.note || null })
      : await supabase.rpc("update_order_status", { p_order_id: orderId, p_status: v.status, p_note: v.note || null });
  if (error) {
    return {
      error:
        error.message === "INVALID_STATUS_TRANSITION"
          ? "This order changed in the meantime. Reload the page to see its status."
          : "We couldn't update this order. Try again.",
    };
  }

  // Cancelling returns stock, which the shop shows.
  if (parsed.data.status === "cancelled") updateTag(CATALOG_TAG);
  // Tell the customer, after the response (update_order_status returns the order row).
  const token = (updated as { tracking_token?: string } | null)?.tracking_token;
  const note = parsed.data.note || null;
  if (token) {
    const { data: store } = await supabase.from("stores").select("branding").limit(1).maybeSingle();
    const replyTo = (store?.branding as { contact?: { email?: string } } | null)?.contact?.email;
    after(() => sendStatusEmail(token, note, replyTo));
  }
  refresh();
  const label = v.status === "shipped" && formData.get("pickup") === "1" ? "ready for pickup" : LABEL[v.status];
  return { message: `Order marked as ${label}.` };
}

/** Polled by the admin's new-order alert: the newest order (store members only, through RLS). */
export async function checkLatestOrder(): Promise<LatestOrder> {
  return getLatestOrder();
}
