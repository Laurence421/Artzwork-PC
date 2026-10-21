// Reads a "money received" SMS from GCash, Maya or a bank, e.g.
//   "You have received PHP 18,360.37 of GCash from JUAN D. ... Ref. No. 1012345678901."
// Only incoming money counts; "you have sent ...", OTPs and other messages are not payments.

export type PaymentSms = { incoming: boolean; amount: number | null; ref: string | null };

const OUTGOING = /\b(you have sent|you sent|sent to|sent you a request|paid to|payment to|transferred to|debited|withdraw\w*|cash[ -]?out|one[ -]time|otp|verification code)\b/i;
const INCOMING = /\b(received|receive|credited|deposited|incoming|cash[ -]?in|has been added)\b/i;
// "PHP 18,360.37", "Php18360", "P18,360.37", "₱ 1,000"
const AMOUNT = /(?:\bPHP|₱|\bP)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/i;
// "Ref. No. 1012 345 678901", "Ref No: 6012345", "Reference: ABC12345", "REF#7788990011"
const REF = /\b(?:[Rr]ef(?:erence)?|REF(?:ERENCE)?)\.?\s*(?:[Nn]o\.?|NO\.?|[Nn]umber|#)?\s*:?\s*([0-9A-Z]{4,}(?:[ -][0-9]{2,}){0,4})/;

/** Amount in centavos (null if none), the transaction reference, and whether money came in. */
export function readPaymentSms(text: string): PaymentSms {
  const body = text.replace(/\s+/g, " ").trim();
  const incoming = INCOMING.test(body) && !OUTGOING.test(body);
  if (!incoming) return { incoming: false, amount: null, ref: null };

  // The amount after the "received" word: later amounts are usually the new balance.
  const from = body.search(INCOMING);
  const match = AMOUNT.exec(body.slice(from)) ?? AMOUNT.exec(body);
  const amount = match ? Number(match[1].replace(/,/g, "")) * 100 + Number((match[2] ?? "0").padEnd(2, "0")) : null;
  const ref = REF.exec(body)?.[1]?.trim() ?? null;
  return { incoming: true, amount: amount && amount > 0 ? amount : null, ref };
}
