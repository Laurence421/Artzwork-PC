import "server-only";

/**
 * Sends one email through Resend's HTTP API. Off until RESEND_API_KEY and EMAIL_FROM
 * are set: then it does nothing, so the shop works the same without email.
 * Never throws; a failed email must not break checkout or the seller's action.
 */
export async function sendEmail(message: { to: string; subject: string; html: string; text: string; replyTo?: string }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from || !message.to) return;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo && { reply_to: message.replyTo }),
      }),
    });
    if (!res.ok) console.error("Email not sent:", res.status, await res.text());
  } catch (err) {
    console.error("Email not sent:", err);
  }
}

/** Text from customers or the seller, made safe to put inside HTML. */
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
