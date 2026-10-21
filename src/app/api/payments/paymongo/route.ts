import { after } from "next/server";
import { sendStatusEmail } from "@/features/shared/lib/order-emails";
import { confirmSecret, paymentProvider, sessionResult, verifyPaymongoSignature } from "@/features/shared/lib/payments";
import { createPublicClient } from "@/lib/supabase/public";

// PayMongo calls this when a checkout session is paid (Developers > Webhooks in PayMongo, event
// "checkout_session.payment.paid", URL https://<shop>/api/payments/paymongo). The order becomes
// paid even if the customer closes the page before coming back. Only signed calls are accepted.
export async function POST(request: Request) {
  if (paymentProvider() !== "paymongo") return new Response("Not set up", { status: 404 });
  const raw = await request.text();
  if (!verifyPaymongoSignature(raw, request.headers.get("paymongo-signature"), process.env.PAYMONGO_WEBHOOK_SECRET ?? "")) {
    return new Response("Bad signature", { status: 401 });
  }

  let event: { data?: { attributes?: { type?: string; data?: Parameters<typeof sessionResult>[0] } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const type = event.data?.attributes?.type;
  const session = event.data?.attributes?.data;
  if (type !== "checkout_session.payment.paid" || !session?.id) return new Response("Ignored", { status: 200 });

  const result = sessionResult(session);
  if (!result.paid) return new Response("Not paid", { status: 200 });
  const { data: token, error } = await createPublicClient().rpc("confirm_online_payment", {
    p_secret: confirmSecret(),
    p_session_id: session.id,
    p_amount: result.amount,
    p_ref: result.ref,
  });
  if (error) {
    // Unknown session or wrong amount: tell PayMongo, so it shows in its webhook log.
    console.error("PayMongo webhook not applied:", error.message);
    return new Response(error.message, { status: 422 });
  }
  if (typeof token === "string") after(() => sendStatusEmail(token, null));
  return new Response("OK", { status: 200 });
}
