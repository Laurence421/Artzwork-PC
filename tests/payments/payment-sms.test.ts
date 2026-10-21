import { describe, expect, it } from "vitest";
import { readPaymentSms } from "@/features/shared/lib/payment-sms";

// Sample messages in the shapes GCash, Maya and banks send (names and numbers made up).
describe("reading payment SMS", () => {
  it("GCash: money received", () => {
    const sms =
      "You have received PHP 18,360.37 of GCash from JUAN D. 09171234567 on 10-21-2026 03:15 PM. Your new balance is PHP 68,360.37. Ref. No. 1012345678901. Go to GCash app.";
    expect(readPaymentSms(sms)).toEqual({ incoming: true, amount: 1836037, ref: "1012345678901" });
  });

  it("GCash: reference written in groups", () => {
    expect(readPaymentSms("You have received PHP 250.05 of GCash from MARIA S. Ref No. 9012 345 678901").ref).toBe("9012 345 678901");
  });

  it("Maya: money received", () => {
    expect(readPaymentSms("You received P1,500.10 from Pedro Penduko via Maya. Ref no. 7788990011. Balance: P3,200.00")).toEqual({
      incoming: true,
      amount: 150010,
      ref: "7788990011",
    });
  });

  it("Bank (InstaPay credit)", () => {
    const sms = "Your account ending 1234 has been credited with PHP 5,000.42 via InstaPay on 21Oct26. Reference: 20261021A1B2C3. -BPI";
    expect(readPaymentSms(sms)).toEqual({ incoming: true, amount: 500042, ref: "20261021A1B2C3" });
  });

  it("whole pesos and the peso sign", () => {
    expect(readPaymentSms("You have received ₱ 1,000 from a friend").amount).toBe(100000);
    expect(readPaymentSms("Received Php 99.5 from JUAN").amount).toBe(9950);
  });

  it("ignores money going out, codes and other texts", () => {
    expect(readPaymentSms("You have sent PHP 500.00 of GCash to JUAN D. Ref. No. 1234567890").incoming).toBe(false);
    expect(readPaymentSms("Your GCash OTP is 123456. Never share it. You have received a code.").incoming).toBe(false);
    expect(readPaymentSms("Your account has been debited PHP 1,000.00").incoming).toBe(false);
    expect(readPaymentSms("Promo! Get 50% off load today").incoming).toBe(false);
  });

  it("an incoming message without an amount has no amount", () => {
    expect(readPaymentSms("You have received a gift from GCash!")).toEqual({ incoming: true, amount: null, ref: null });
  });
});
