import { describe, expect, it } from "vitest";
import { amountInWords } from "@/lib/purchase-invoices/amount-in-words";

describe("amountInWords", () => {
  it("matches the reference PDF's exact example", () => {
    expect(amountInWords(43896.59)).toBe(
      "INR FORTY-THREE THOUSAND EIGHT HUNDRED NINETY-SIX AND FIFTY-NINE ONLY",
    );
  });

  it("handles a whole number with zero decimal part", () => {
    expect(amountInWords(500)).toBe("INR FIVE HUNDRED AND ZERO ONLY");
  });

  it("handles zero", () => {
    expect(amountInWords(0)).toBe("INR ZERO AND ZERO ONLY");
  });

  it("uses Indian lakh grouping, not international grouping", () => {
    // 1,00,000 — one lakh, not "one hundred thousand".
    expect(amountInWords(100000)).toBe("INR ONE LAKH AND ZERO ONLY");
  });

  it("uses Indian crore grouping", () => {
    // 1,23,45,678 — one crore twenty-three lakh forty-five thousand
    // six hundred seventy-eight.
    expect(amountInWords(12345678)).toBe(
      "INR ONE CRORE TWENTY-THREE LAKH FORTY-FIVE THOUSAND SIX HUNDRED SEVENTY-EIGHT AND ZERO ONLY",
    );
  });

  it("respects the currency parameter", () => {
    expect(amountInWords(100, "USD")).toBe("USD ONE HUNDRED AND ZERO ONLY");
  });

  it("rounds a sub-paise fraction to the nearest cent before spelling out", () => {
    expect(amountInWords(10.005)).toBe("INR TEN AND ONE ONLY");
  });
});
