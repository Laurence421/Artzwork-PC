"use server";

import { formatPrice } from "@/features/shared/lib/money";
import { matchPaymentSms, smsCheckEnabled } from "@/features/shared/lib/payment-sms-match";
import { getSellerStore } from "../queries/store";

export type SmsTestState = { message?: string; error?: string; value?: string };

/** "Try a sample SMS": reads it and says what would happen, without changing any order. */
export async function testPaymentSms(_prev: SmsTestState, formData: FormData): Promise<SmsTestState> {
  await getSellerStore(); // signed-in seller only
  const value = String(formData.get("sample") ?? "").slice(0, 600);
  if (!value.trim()) return { error: "Paste an SMS to try.", value };
  if (!smsCheckEnabled()) return { error: "The automatic check isn't set up on this server yet (SMS_WEBHOOK_KEY).", value };
  try {
    const m = await matchPaymentSms(value, "Sample", true);
    const amount = m.amount !== null ? formatPrice(m.amount) : null;
    const ref = m.ref ? `, reference ${m.ref}` : "";
    const message =
      m.result === "matched"
        ? `Read ${amount}${ref}. This would mark order #${m.orderNo} as paid.`
        : m.result === "already_paid"
          ? `Read ${amount}${ref}. Order #${m.orderNo} is already paid, so nothing would change.`
          : m.result === "ambiguous"
            ? `Read ${amount}. More than one unpaid order waits for that amount, so you'd confirm it yourself.`
            : m.result === "no_match"
              ? `Read ${amount}${ref}. No unpaid order waits for exactly ${amount}, so you'd confirm it yourself.`
              : "This doesn't look like money received (or has no amount), so it would be ignored.";
    return { message, value };
  } catch {
    return { error: "We couldn't check that SMS. Try again.", value };
  }
}
