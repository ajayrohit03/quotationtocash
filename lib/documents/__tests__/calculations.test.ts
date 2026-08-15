import { describe, expect, it } from "vitest";
import { calculateLineAmount } from "@/lib/documents/calculations";

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
    // 3 * 33.335 = 100.005 -> rounds to 100.01 (half-up)
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
