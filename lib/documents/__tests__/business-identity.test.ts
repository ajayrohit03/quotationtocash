import { describe, expect, it } from "vitest";
import { businessIdentityLine } from "@/lib/documents/business-identity";
import type { BusinessSnapshot } from "@/lib/documents/snapshots";

const base: BusinessSnapshot = {
  name: "Debug Co",
  email: "debug@example.invalid",
  phone: null,
  address: null,
  city: null,
  state: null,
  country: null,
  website: null,
  logoUrl: null,
  gstEnabled: false,
  gstin: null,
  placeOfSupply: null,
  registrationType: null,
  bankName: null,
  accountHolderName: null,
  accountNumber: null,
  ifscCode: null,
  upiId: null,
  pan: null,
  tan: null,
  cin: null,
  swiftCode: null,
};

describe("businessIdentityLine", () => {
  it("returns null when none of the four fields are set", () => {
    expect(businessIdentityLine(base)).toBeNull();
  });

  it("joins only the populated fields, skipping blanks", () => {
    expect(businessIdentityLine({ ...base, pan: "ABCDE1234F", cin: "U12345MH2020PTC123456" })).toBe(
      "PAN ABCDE1234F · CIN U12345MH2020PTC123456",
    );
  });

  it("includes all four when all are set, in a fixed order", () => {
    expect(
      businessIdentityLine({
        ...base,
        pan: "ABCDE1234F",
        tan: "ABCD12345E",
        cin: "U12345MH2020PTC123456",
        swiftCode: "ABCDINBBXXX",
      }),
    ).toBe("PAN ABCDE1234F · TAN ABCD12345E · CIN U12345MH2020PTC123456 · SWIFT ABCDINBBXXX");
  });
});
