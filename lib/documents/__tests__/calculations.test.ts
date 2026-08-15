import { describe, expect, it } from "vitest";
import {
  calculateBaseTotals,
  calculateLineAmount,
} from "@/lib/documents/calculations";

describe("calculateLineAmount", () => {
  it("multiplies qty by rate with no discount", () => {
    expect(calculateLineAmount({ qty: 3, rate: 100 }).toString()).toBe("300");
  });

  it("applies a percentage discount", () => {
    // 10 * 200 = 2000, less 15% = 1700
    expect(
      calculateLineAmount({ qty: 10, rate: 200, discountPct: 15 }).toString(),
    ).toBe("1700");
  });

  it("rounds to the cent", () => {
    // 3 * 33.335 = 100.005 -> rounds to 100 (banker's-adjacent .5 rounds up)
    expect(calculateLineAmount({ qty: 3, rate: 33.335 }).toString()).toBe(
      "100.01",
    );
  });

  it("treats a missing discount the same as zero", () => {
    expect(calculateLineAmount({ qty: 2, rate: 50 }).toString()).toBe(
      calculateLineAmount({ qty: 2, rate: 50, discountPct: 0 }).toString(),
    );
  });
});

describe("calculateBaseTotals", () => {
  it("sums gross, discount, and taxable amount across line items", () => {
    const totals = calculateBaseTotals([
      { qty: 2, rate: 500, discountPct: 10 }, // gross 1000, amount 900
      { qty: 1, rate: 1000 }, // gross 1000, amount 1000
    ]);

    expect(totals.subtotal.toString()).toBe("2000");
    expect(totals.discountTotal.toString()).toBe("100");
    expect(totals.taxableAmount.toString()).toBe("1900");
    // No GST engine yet (Phase 5) — total is just the taxable amount.
    expect(totals.total.toString()).toBe(totals.taxableAmount.toString());
  });

  it("returns zeroes for an empty line item list", () => {
    const totals = calculateBaseTotals([]);
    expect(totals.subtotal.toString()).toBe("0");
    expect(totals.discountTotal.toString()).toBe("0");
    expect(totals.taxableAmount.toString()).toBe("0");
    expect(totals.total.toString()).toBe("0");
  });

  it("never produces floating-point drift across many fractional lines", () => {
    // 10 lines of qty=1, rate=0.1 — the classic 0.1+0.1+... float trap.
    const items = Array.from({ length: 10 }, () => ({ qty: 1, rate: 0.1 }));
    const totals = calculateBaseTotals(items);
    expect(totals.subtotal.toString()).toBe("1");
  });
});
