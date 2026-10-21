// QR Ph (the Philippines' EMVCo QR standard, used by GCash, Maya and the banks).
// A QR's text is a list of fields: 2-digit id, 2-digit length, value. Field 54 is the amount and
// field 63 a CRC-16 checksum of everything before it. The seller's own QR is "static" (no amount);
// adding field 54 (and marking it dynamic, 01 = "12") makes a QR with the order's amount filled in.

export type QrField = { id: string; value: string };

/** Splits the QR text into its fields; null if it isn't well formed. */
export function parseQrPh(payload: string): QrField[] | null {
  const fields: QrField[] = [];
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(payload.slice(i + 2, i + 4))) return null;
    const value = payload.slice(i + 4, i + 4 + len);
    if (value.length !== len) return null;
    fields.push({ id, value });
    i += 4 + len;
  }
  return fields;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, start 0xFFFF), as QR Ph field 63 uses, in 4 upper-case hex digits. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function encode(fields: QrField[]): string {
  return fields.map((f) => `${f.id}${String(f.value.length).padStart(2, "0")}${f.value}`).join("");
}

/** Is this a QR Ph payment code: payload format 01, Philippine peso, PH, and a correct checksum? */
export function isQrPh(payload: string): boolean {
  if (!/^000201/.test(payload) || payload.length > 512) return false;
  const fields = parseQrPh(payload);
  if (!fields) return false;
  const get = (id: string) => fields.find((f) => f.id === id)?.value;
  if (get("53") !== "608" || get("58") !== "PH") return false;
  const crc = fields.at(-1);
  if (crc?.id !== "63") return false;
  return crc16(payload.slice(0, -4)) === crc.value.toUpperCase();
}

/** The account holder's name on the QR (field 59), for the seller to recognise it. */
export function qrPhName(payload: string): string {
  return parseQrPh(payload)?.find((f) => f.id === "59")?.value ?? "";
}

/** The seller's QR with the amount (centavos) filled in: dynamic, field 54 set, checksum redone. */
export function qrPhWithAmount(payload: string, centavos: number): string {
  if (!isQrPh(payload)) throw new Error("Not a QR Ph code");
  const fields = parseQrPh(payload)!.filter((f) => f.id !== "63" && f.id !== "54");
  const pos = fields.findIndex((f) => f.id === "01");
  if (pos >= 0) fields[pos] = { id: "01", value: "12" };
  else fields.splice(1, 0, { id: "01", value: "12" });
  // Field 54 goes right after 53 (currency), keeping the fields in id order.
  const at = fields.findIndex((f) => Number(f.id) > 54);
  const amount = { id: "54", value: (centavos / 100).toFixed(2) };
  if (at === -1) fields.push(amount);
  else fields.splice(at, 0, amount);
  const body = `${encode(fields)}6304`;
  return body + crc16(body);
}

/** The amount (centavos) in a QR Ph code, or null when it has none. */
export function qrPhAmount(payload: string): number | null {
  const v = parseQrPh(payload)?.find((f) => f.id === "54")?.value;
  return v ? Math.round(Number(v) * 100) : null;
}
