import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createPublicClient } from "@/lib/supabase/public";
import { readPaymentSms } from "./payment-sms";
import { confirmSecret } from "./payments";

export type SmsMatch = {
  result: "matched" | "already_paid" | "no_match" | "ambiguous" | "not_payment";
  amount: number | null;
  ref: string | null;
  orderNo: number | null;
  trackingToken: string | null;
};

/** Is the automatic check set up on this server (a key for the phone, and the database secret)? */
export function smsCheckEnabled() {
  return Boolean(process.env.SMS_WEBHOOK_KEY && process.env.SMS_WEBHOOK_KEY.length >= 24 && confirmSecret());
}

/** Where the phone's SMS forwarder posts, key included (shown to the seller in Settings). */
export function smsWebhookUrl() {
  return smsCheckEnabled() ? `${process.env.SHOP_URL ?? ""}/api/payments/sms?key=${process.env.SMS_WEBHOOK_KEY}` : null;
}

export function smsKeyMatches(key: string | null) {
  const expected = process.env.SMS_WEBHOOK_KEY ?? "";
  return !!key && expected.length >= 24 && key.length === expected.length && timingSafeEqual(Buffer.from(key), Buffer.from(expected));
}

/**
 * Reads a forwarded SMS and matches it to the one unpaid order waiting for that exact amount.
 * dryRun: only says what would happen (Settings > "Try a sample SMS").
 * Messages that aren't incoming payments are logged without their text (the seller's other SMS stay private).
 */
export async function matchPaymentSms(text: string, sender: string, dryRun = false): Promise<SmsMatch> {
  const sms = readPaymentSms(text);
  const { data, error } = await createPublicClient().rpc("match_payment_sms", {
    p_secret: confirmSecret(),
    p_amount: sms.amount,
    p_ref: sms.ref,
    p_sender: sender.slice(0, 60),
    p_body: sms.incoming ? text.slice(0, 600) : "(not a payment message)",
    p_dry_run: dryRun,
  });
  if (error) throw new Error(error.message);
  const r = data as { result: SmsMatch["result"]; order_no: number | null; tracking_token: string | null };
  return { result: r.result, amount: sms.amount, ref: sms.ref, orderNo: r.order_no, trackingToken: r.tracking_token };
}
