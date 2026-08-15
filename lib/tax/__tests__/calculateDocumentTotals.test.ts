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

  // Rounding convention: each line's tax is rounded to the cent
  // individually (inside calculateGST), and the already-rounded per-line
  // amounts are what get summed — not summed as precise Decimals and
  // rounded once at the end. This locks that in with numbers chosen so
  // the two approaches actually disagree, rather than coincidentally
  // matching.
  it("rounds tax per line item and sums the rounded amounts", () => {
    // Three identical lines: taxable ₹2.50 @ 5% IGST -> raw 0.125 each,
    // which rounds half-up to ₹0.13 per line. Summed per-line: ₹0.39.
    // If tax were instead summed as precise decimals first (0.125 * 3 =
    // 0.375) and rounded once at the end, that rounds to ₹0.38 — one
    // paisa less. The assertion below is only true under the per-line
    // convention.
    const items = [
      { qty: 1, rate: 2.5, gstRate: 5 },
      { qty: 1, rate: 2.5, gstRate: 5 },
      { qty: 1, rate: 2.5, gstRate: 5 },
    ];
    const totals = calculateDocumentTotals(items, {
      gstEnabled: true,
      sameState: false,
    });

    expect(totals.taxableAmount.toString()).toBe("7.5");
    expect(totals.igst.toString()).toBe("0.39");
    expect(totals.total.toString()).toBe("7.89");
  });
});
