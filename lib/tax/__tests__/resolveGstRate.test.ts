import { describe, expect, it } from "vitest";
import { resolveGstRate } from "@/lib/tax/resolveGstRate";

describe("resolveGstRate", () => {
  it("prefers the line item's own override", () => {
    expect(resolveGstRate(12, 18, 5)?.toString()).toBe("12");
  });

  it("falls back to the product's rate when the item has none", () => {
    expect(resolveGstRate(null, 18, 5)?.toString()).toBe("18");
    expect(resolveGstRate(undefined, 18, 5)?.toString()).toBe("18");
  });

  it("falls back to the business default when neither item nor product has a rate", () => {
    expect(resolveGstRate(null, null, 5)?.toString()).toBe("5");
  });

  it("returns null when nothing provides a rate", () => {
    expect(resolveGstRate(null, null, null)).toBeNull();
  });

  it("treats an explicit 0% override as a real value, not 'unset'", () => {
    // 0 is falsy but a legitimate GST rate (zero-rated goods) — must not
    // fall through to the product/business default.
    expect(resolveGstRate(0, 18, 5)?.toString()).toBe("0");
  });
});
