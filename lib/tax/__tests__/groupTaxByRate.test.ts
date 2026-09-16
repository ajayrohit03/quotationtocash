import { describe, expect, it } from "vitest";
import { groupTaxByRate } from "@/lib/tax/groupTaxByRate";

describe("groupTaxByRate", () => {
  // The reference-invoice scenario this fix exists for (see
  // docs/custom-fields-and-multicurrency-design.md §5): a 2.5% line and
  // a 9% line on the same document must show as two separate rate rows,
  // not one blended total.
  it("groups mixed rates into separate buckets, sorted ascending", () => {
    const buckets = groupTaxByRate(
      [
        { amount: 1000, gstRate: 9 },
        { amount: 500, gstRate: 2.5 },
      ],
      true,
    );
    expect(buckets.map((b) => b.rate)).toEqual([2.5, 9]);
  });

  it("sums multiple lines at the same rate into one bucket", () => {
    const buckets = groupTaxByRate(
      [
        { amount: 1000, gstRate: 18 },
        { amount: 500, gstRate: 18 },
      ],
      true,
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0].taxableAmount).toBe(1500);
    // 1500 @ 18% same-state = 270 total, split 135/135
    expect(buckets[0].cgst).toBe(135);
    expect(buckets[0].sgst).toBe(135);
  });

  it("splits CGST+SGST for same-state, matching calculateGST's own worked example", () => {
    const buckets = groupTaxByRate([{ amount: 10000, gstRate: 18 }], true);
    expect(buckets[0].cgst).toBe(900);
    expect(buckets[0].sgst).toBe(900);
    expect(buckets[0].igst).toBe(0);
  });

  it("applies the full rate as IGST for an inter-state supply", () => {
    const buckets = groupTaxByRate([{ amount: 10000, gstRate: 18 }], false);
    expect(buckets[0].cgst).toBe(0);
    expect(buckets[0].sgst).toBe(0);
    expect(buckets[0].igst).toBe(1800);
  });

  it("skips lines with a null or zero rate entirely — no zero-value bucket", () => {
    const buckets = groupTaxByRate(
      [
        { amount: 1000, gstRate: null },
        { amount: 500, gstRate: 0 },
        { amount: 200, gstRate: 12 },
      ],
      true,
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0].rate).toBe(12);
  });

  it("returns an empty array when no line has a taxable rate", () => {
    expect(groupTaxByRate([{ amount: 1000, gstRate: null }], true)).toEqual([]);
    expect(groupTaxByRate([], true)).toEqual([]);
  });

  // The single-rate case (the overwhelmingly common one) must sum to
  // exactly the same total as calculateDocumentTotals would produce for
  // the same input, so the grouped display never visibly disagrees with
  // the persisted grand total for the common case.
  it("matches calculateGST's own rounding for a single bucket", () => {
    const buckets = groupTaxByRate([{ amount: 999, gstRate: 5 }], true);
    expect(buckets[0].cgst).toBe(24.98);
    expect(buckets[0].sgst).toBe(24.98);
  });
});
