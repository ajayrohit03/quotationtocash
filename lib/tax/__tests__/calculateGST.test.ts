import { describe, expect, it } from "vitest";
import { calculateGST, isSameState } from "@/lib/tax/calculateGST";

describe("calculateGST", () => {
  // The exact worked example from the spec: ₹10,000 at 18% GST.
  it("splits into CGST + SGST for a same-state supply", () => {
    const { cgst, sgst, igst } = calculateGST(10000, 18, true);
    expect(cgst.toString()).toBe("900");
    expect(sgst.toString()).toBe("900");
    expect(igst.toString()).toBe("0");
  });

  it("applies the full rate as IGST for an inter-state supply", () => {
    const { cgst, sgst, igst } = calculateGST(10000, 18, false);
    expect(cgst.toString()).toBe("0");
    expect(sgst.toString()).toBe("0");
    expect(igst.toString()).toBe("1800");
  });

  it("returns zero tax when the rate is null (no GST applicable)", () => {
    const result = calculateGST(10000, null, true);
    expect(result.cgst.toString()).toBe("0");
    expect(result.sgst.toString()).toBe("0");
    expect(result.igst.toString()).toBe("0");
  });

  it("returns zero tax for a 0% rate", () => {
    const result = calculateGST(10000, 0, false);
    expect(result.igst.toString()).toBe("0");
  });

  it("returns zero tax on a zero taxable amount", () => {
    const result = calculateGST(0, 18, true);
    expect(result.cgst.toString()).toBe("0");
    expect(result.sgst.toString()).toBe("0");
  });

  it("handles an odd rate without losing a paisa to rounding", () => {
    // 5% same-state on ₹999: half-rate 2.5% each = 24.975 -> rounds to 24.98 (half-up)
    const { cgst, sgst } = calculateGST(999, 5, true);
    expect(cgst.toString()).toBe("24.98");
    expect(sgst.toString()).toBe("24.98");
  });
});

describe("isSameState", () => {
  it("matches identical states", () => {
    expect(isSameState("Maharashtra", "Maharashtra")).toBe(true);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(isSameState(" Maharashtra ", "MAHARASHTRA")).toBe(true);
  });

  it("detects a different state as inter-state", () => {
    expect(isSameState("Maharashtra", "Karnataka")).toBe(false);
  });

  it("defaults to same-state when either side is missing", () => {
    expect(isSameState(null, "Karnataka")).toBe(true);
    expect(isSameState("Maharashtra", null)).toBe(true);
    expect(isSameState(null, null)).toBe(true);
  });
});
