import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/auth/errors";
import {
  INVOICE_STATUSES,
  QUOTATION_STATUSES,
  isEditableStatus,
  isManuallySettableStatus,
  isValidStatus,
  requireEditableDocument,
} from "@/lib/documents/status";

describe("isEditableStatus", () => {
  it("is true only for draft", () => {
    expect(isEditableStatus("draft")).toBe(true);
  });

  it("is false for every other quotation status", () => {
    for (const status of QUOTATION_STATUSES) {
      if (status === "draft") continue;
      expect(isEditableStatus(status)).toBe(false);
    }
  });

  it("is false for every other invoice status", () => {
    for (const status of INVOICE_STATUSES) {
      if (status === "draft") continue;
      expect(isEditableStatus(status)).toBe(false);
    }
  });

  it("is false for garbage input, not just known non-draft statuses", () => {
    expect(isEditableStatus("not-a-real-status")).toBe(false);
    expect(isEditableStatus("")).toBe(false);
  });
});

describe("isValidStatus", () => {
  it("accepts every status in a type's own vocabulary", () => {
    for (const status of QUOTATION_STATUSES) {
      expect(isValidStatus("quotation", status)).toBe(true);
    }
    for (const status of INVOICE_STATUSES) {
      expect(isValidStatus("invoice", status)).toBe(true);
    }
  });

  it("rejects the other type's statuses that aren't shared", () => {
    // "accepted"/"converted" are quotation-only; "paid"/"overdue" are
    // invoice-only. Neither vocabulary should leak into the other.
    expect(isValidStatus("invoice", "accepted")).toBe(false);
    expect(isValidStatus("invoice", "converted")).toBe(false);
    expect(isValidStatus("quotation", "paid")).toBe(false);
    expect(isValidStatus("quotation", "overdue")).toBe(false);
  });
});

describe("isManuallySettableStatus", () => {
  it("blocks every status with its own dedicated endpoint, for both types", () => {
    const restricted = ["sent", "viewed", "paid", "accepted", "converted"];
    for (const status of restricted) {
      expect(isManuallySettableStatus("quotation", status)).toBe(false);
      expect(isManuallySettableStatus("invoice", status)).toBe(false);
    }
  });

  it("allows the manual quotation statuses", () => {
    expect(isManuallySettableStatus("quotation", "draft")).toBe(true);
    expect(isManuallySettableStatus("quotation", "declined")).toBe(true);
    expect(isManuallySettableStatus("quotation", "expired")).toBe(true);
  });

  it("allows the manual invoice statuses", () => {
    expect(isManuallySettableStatus("invoice", "draft")).toBe(true);
    expect(isManuallySettableStatus("invoice", "cancelled")).toBe(true);
  });

  it("rejects a status from the wrong type's vocabulary even if it looks manual", () => {
    // "cancelled" is a real, manually-settable *invoice* status, but not
    // a valid quotation status at all.
    expect(isManuallySettableStatus("quotation", "cancelled")).toBe(false);
  });
});

describe("requireEditableDocument", () => {
  it("does not throw for a draft", () => {
    expect(() => requireEditableDocument("draft")).not.toThrow();
  });

  it("throws ForbiddenError for every non-draft status of either type", () => {
    for (const status of [...QUOTATION_STATUSES, ...INVOICE_STATUSES]) {
      if (status === "draft") continue;
      expect(() => requireEditableDocument(status)).toThrow(ForbiddenError);
    }
  });
});
