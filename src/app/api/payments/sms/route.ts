import { after } from "next/server";
import { sendStatusEmail } from "@/features/shared/lib/order-emails";
import { matchPaymentSms, smsCheckEnabled, smsKeyMatches } from "@/features/shared/lib/payment-sms-match";

// The shop's phone forwards its GCash / bank SMS here (an SMS forwarder app, see Settings >
// Automatic payment check). The secret key in the address is what lets it in.
// Accepts JSON or a form, with the text in message/text/body/msg/content and the sender in
// from/sender/phone/number/address, so most forwarder apps work without a custom template.
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!smsCheckEnabled() || !smsKeyMatches(url.searchParams.get("key"))) return new Response("Not found", { status: 404 });

  const fields = await readFields(request);
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = fields[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    return "";
  };
  const text = pick("message", "text", "body", "msg", "content", "sms");
  const sender = pick("from", "sender", "phone", "number", "address", "title");
  if (!text) return Response.json({ result: "empty" }, { status: 400 });

  // Optional: only messages from these senders (e.g. "GCash,BPI,BDO").
  const allowed = (process.env.SMS_ALLOWED_SENDERS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.some((a) => sender.toLowerCase().includes(a))) return Response.json({ result: "ignored_sender" });

  try {
    const match = await matchPaymentSms(text, sender);
    if (match.result === "matched" && match.trackingToken) {
      const token = match.trackingToken;
      after(() => sendStatusEmail(token, null)); // the customer hears their payment arrived
    }
    return Response.json({ result: match.result, order: match.orderNo });
  } catch (err) {
    console.error("Payment SMS not processed:", err);
    return Response.json({ result: "error" }, { status: 500 });
  }
}

async function readFields(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const json = await request.json();
      return json && typeof json === "object" ? (json as Record<string, unknown>) : {};
    }
    if (type.includes("form")) return Object.fromEntries(await request.formData());
    return { message: await request.text() };
  } catch {
    return {};
  }
}
