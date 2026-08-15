import { describe, expect, it } from "vitest";
import { calculateDocumentTotals } from "@/lib/tax/calculateDocumentTotals";

describe("calculateDocumentTotals", () => {
  it("produces a plain total with no tax fields when GST is disabled", () => {
    const totals = calculateDocumentTotals(
      [{ qty: 2, rate: 500, discountPct: 10, gstRate: 18 }],
      { gstEnabled: false, sameState: true },
    );

    expect(totals.subtotal.toString()).toBe("1000");
    expect(totals.discountTotal.toString()).toBe("100");
    expect(totals.taxableAmount.toString()).toBe("900");
    expect(totals.cgst.toString()).toBe("0");
    expect(totals.sgst.toString()).toBe("0");
    expect(totals.igst.toString()).toBe("0");
    // No tax applied at all — not even on a rate the line item carries.
    expect(totals.total.toString()).toBe("900");
  });

  it("matches the spec's worked example for a same-state invoice", () => {
    const totals = calculateDocumentTotals(
      [{ qty: 1, rate: 10000, gstRate: 18 }],
      { gstEnabled: true, sameState: true },
    );

    expect(totals.taxableAmount.toString()).toBe("10000");
    expect(totals.cgst.toString()).toBe("900");
    expect(totals.sgst.toString()).toBe("900");
    expect(totals.igst.toString()).toBe("0");
    expect(totals.total.toString()).toBe("11800");
  });

  it("matches the spec's worked example for an inter-state invoice", () => {
    const totals = calculateDocumentTotals(
      [{ qty: 1, rate: 10000, gstRate: 18 }],
      { gstEnabled: true, sameState: false },
    );

    expect(totals.cgst.toString()).toBe("0");
    expect(totals.sgst.toString()).toBe("0");
    expect(totals.igst.toString()).toBe("1800");
    expect(totals.total.toString()).toBe("11800");
  });

  it("sums tax correctly across line items with different GST rates", () => {
    const totals = calculateDocumentTotals(
      [
        { qty: 1, rate: 1000, gstRate: 18 }, // taxable 1000, IGST 180
        { qty: 1, rate: 1000, gstRate: 5 }, // taxable 1000, IGST 50
        { qty: 1, rate: 1000, gstRate: null }, // no GST on this line
      ],
      { gstEnabled: true, sameState: false },
    );

    expect(totals.taxableAmount.toString()).toBe("3000");
    expect(totals.igst.toString()).toBe("230");
    expect(totals.total.toString()).toBe("3230");
  });

  it("applies discount before computing tax", () => {
    // ₹1000 line, 50% off -> taxable 500, 18% same-state -> 45 + 45
    const totals = calculateDocumentTotals(
      [{ qty: 1, rate: 1000, discountPct: 50, gstRate: 18 }],
      { gstEnabled: true, sameState: true },
    );

    expect(totals.discountTotal.toString()).toBe("500");
    expect(totals.taxableAmount.toString()).toBe("500");
    expect(totals.cgst.toString()).toBe("45");
    expect(totals.sgst.toString()).toBe("45");
    expect(totals.total.toString()).toBe("590");
  });

  it("returns all zeroes for an empty line item list", () => {
    const totals = calculateDocumentTotals([], {
      gstEnabled: true,
      sameState: true,
    });
    expect(totals.subtotal.toString()).toBe("0");
    expect(totals.taxableAmount.toString()).toBe("0");
    expect(totals.total.toString()).toBe("0");
  });

  it("never produces floating-point drift across many fractional lines", () => {
    const items = Array.from({ length: 10 }, () => ({
      qty: 1,
      rate: 0.1,
      gstRate: null,
    }));
    const totals = calculateDocumentTotals(items, {
      gstEnabled: false,
      sameState: true,
    });
    expect(totals.subtotal.toString()).toBe("1");
  });
});
