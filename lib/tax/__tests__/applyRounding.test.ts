import { describe, expect, it } from "vitest";
import { applyRounding } from "@/lib/tax/applyRounding";

describe("applyRounding", () => {
  it("is a no-op when roundTotal is false, regardless of the raw total", () => {
    expect(applyRounding(232114.31, false)).toEqual({
      total: 232114.31,
      roundingAdjustment: 0,
    });
  });

  it("rounds down and reports a negative adjustment", () => {
    const { total, roundingAdjustment } = applyRounding(232114.31, true);
    expect(total).toBe(232114);
    expect(roundingAdjustment).toBeCloseTo(-0.31, 5);
  });

  it("rounds up and reports a positive adjustment", () => {
    const { total, roundingAdjustment } = applyRounding(11799.31, true);
    expect(total).toBe(11799);
    expect(roundingAdjustment).toBeCloseTo(-0.31, 5);

    const { total: total2, roundingAdjustment: adj2 } = applyRounding(11799.69, true);
    expect(total2).toBe(11800);
    expect(adj2).toBeCloseTo(0.31, 5);
  });

  it("is a no-op when the raw total is already a whole number", () => {
    expect(applyRounding(11800, true)).toEqual({
      total: 11800,
      roundingAdjustment: 0,
    });
  });

  it("never leaves a floating-point tail in the adjustment", () => {
    const { roundingAdjustment } = applyRounding(232114.31, true);
    // Exact equality, not toBeCloseTo — the whole point of the module's
    // own two-decimal rounding step is to avoid a value like
    // -0.30999999999994907 leaking into the formatted "Rounding" line.
    expect(roundingAdjustment).toBe(-0.31);
  });
});
