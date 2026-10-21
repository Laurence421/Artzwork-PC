import { describe, expect, it } from "vitest";
import { crc16, isQrPh, parseQrPh, qrPhAmount, qrPhName, qrPhWithAmount } from "@/features/shared/lib/qrph";

// A made-up static QR Ph in the shape a GCash personal QR has (no amount, point of initiation 11).
// Built field by field so the test doesn't depend on any real account.
function tlv(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}
function sampleStaticQr() {
  const account = tlv("00", "com.p2pqrpay") + tlv("01", "GXCHPHM2XXX") + tlv("02", "99964403") + tlv("04", "09171234567") + tlv("05", "+63-917****567");
  const body =
    tlv("00", "01") + tlv("01", "11") + tlv("27", account) + tlv("52", "6016") + tlv("53", "608") + tlv("58", "PH") + tlv("59", "SAMPLE ARTZWORK") + tlv("60", "MANILA") + "6304";
  return body + crc16(body);
}

describe("QR Ph", () => {
  it("computes the standard CRC-16 (check value of '123456789' is 29B1)", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("recognises a valid QR Ph code and rejects tampered or foreign ones", () => {
    const qr = sampleStaticQr();
    expect(isQrPh(qr)).toBe(true);
    expect(qrPhName(qr)).toBe("SAMPLE ARTZWORK");
    expect(isQrPh(qr.replace("SAMPLE", "SAMPLX"))).toBe(false); // checksum no longer fits
    expect(isQrPh("https://example.com")).toBe(false);
    expect(isQrPh("")).toBe(false);
  });

  it("fills in the amount: dynamic, field 54 after 53, new checksum, account untouched", () => {
    const qr = sampleStaticQr();
    const withAmount = qrPhWithAmount(qr, 1836037);
    expect(isQrPh(withAmount)).toBe(true);
    expect(qrPhAmount(withAmount)).toBe(1836037);
    const fields = parseQrPh(withAmount)!;
    expect(fields.find((f) => f.id === "01")?.value).toBe("12");
    expect(fields.find((f) => f.id === "54")?.value).toBe("18360.37");
    expect(fields.map((f) => f.id)).toEqual(["00", "01", "27", "52", "53", "54", "58", "59", "60", "63"]);
    expect(fields.find((f) => f.id === "27")?.value).toBe(parseQrPh(qr)!.find((f) => f.id === "27")?.value);
  });

  it("replaces an amount that is already there", () => {
    const once = qrPhWithAmount(sampleStaticQr(), 10000);
    const twice = qrPhWithAmount(once, 22291);
    expect(qrPhAmount(twice)).toBe(22291);
    expect(parseQrPh(twice)!.filter((f) => f.id === "54")).toHaveLength(1);
  });

  it("refuses to add an amount to something that isn't QR Ph", () => {
    expect(() => qrPhWithAmount("hello", 100)).toThrow("Not a QR Ph code");
  });
});
