import "server-only";
import { publicImageUrl } from "@/features/shared/lib/storage";
import { getSellerStore } from "./store";

export type PaymentType = "cod" | "gcash" | "bank_transfer";

export type PaymentSetting = {
  type: PaymentType;
  enabled: boolean;
  label: string;
  instructions: string;
  accountName: string;
  accountNumber: string;
  qrPath: string | null;
  qrUrl: string | null;
  /** The text inside the QR (QR Ph), so order pages can show it with the amount filled in. */
  qrPayload: string | null;
  /** GCash / bank only: customers pay on the provider's page (online) instead of sending money themselves. */
  online: boolean;
};

export type ShippingSetting = { id: string; name: string; description: string; fee: number; enabled: boolean; kind: "delivery" | "pickup" };

export type Settings = {
  payments: Record<PaymentType, PaymentSetting>;
  shipping: ShippingSetting[];
  pendingOrderTtlDays: number;
  sellerEmail: string;
};

/** What a payment method looks like before the seller has set it up. */
export const PAYMENT_DEFAULTS: Record<PaymentType, { label: string; instructions: string }> = {
  cod: { label: "Cash on delivery", instructions: "Pay the courier when your order arrives." },
  gcash: { label: "GCash", instructions: "Send the total to our GCash number, then reply to your order email with the reference number." },
  bank_transfer: { label: "Bank transfer", instructions: "Transfer the total to our bank account, then reply to your order email with a photo of the receipt." },
};

export async function getSettings(): Promise<Settings> {
  const { supabase, store } = await getSellerStore();
  const [payments, shipping, storeRow, auth] = await Promise.all([
    supabase
      .from("payment_methods")
      .select("type, enabled, label, instructions, account_name, account_number, qr_path, qr_payload, online")
      .eq("store_id", store.id)
      .order("position"),
    supabase.from("shipping_options").select("id, name, description, fee, enabled, kind").eq("store_id", store.id).order("position").order("created_at"),
    supabase.from("stores").select("pending_order_ttl_days").eq("id", store.id).single(),
    supabase.auth.getClaims(),
  ]);

  const byType = Object.fromEntries(
    (["cod", "gcash", "bank_transfer"] as PaymentType[]).map((type) => {
      const row = payments.data?.find((p) => p.type === type);
      return [
        type,
        {
          type,
          enabled: row?.enabled ?? false,
          label: row?.label ?? PAYMENT_DEFAULTS[type].label,
          instructions: row?.instructions ?? PAYMENT_DEFAULTS[type].instructions,
          accountName: row?.account_name ?? "",
          accountNumber: row?.account_number ?? "",
          qrPath: row?.qr_path ?? null,
          qrUrl: row?.qr_path ? publicImageUrl(row.qr_path) : null,
          qrPayload: row?.qr_payload ?? null,
          online: row?.online ?? false,
        } satisfies PaymentSetting,
      ];
    }),
  ) as Record<PaymentType, PaymentSetting>;

  return {
    payments: byType,
    shipping: shipping.data ?? [],
    pendingOrderTtlDays: storeRow.data?.pending_order_ttl_days ?? 3,
    sellerEmail: typeof auth.data?.claims?.email === "string" ? auth.data.claims.email : "",
  };
}

export type PaymentSmsRow = { id: string; receivedAt: string; amount: number | null; ref: string | null; result: string; orderNo: number | null; orderId: string | null };

/** The latest SMS the shop's phone forwarded, and what each matched (Settings > Automatic payment check). */
export async function getRecentPaymentSms(): Promise<PaymentSmsRow[]> {
  const { supabase, store } = await getSellerStore();
  const { data } = await supabase
    .from("payment_sms")
    .select("id, received_at, amount, ref, result, order_id, orders(order_no)")
    .eq("store_id", store.id)
    .order("received_at", { ascending: false })
    .limit(10);
  return (data ?? []).map((r) => ({
    id: r.id,
    receivedAt: r.received_at,
    amount: r.amount,
    ref: r.ref,
    result: r.result,
    orderId: r.order_id,
    orderNo: (r.orders as { order_no?: number } | null)?.order_no ?? null,
  }));
}
