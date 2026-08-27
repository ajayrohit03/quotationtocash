import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/auth/errors";
import {
  INVOICE_STATUSES,
  QUOTATION_STATUSES,
  canConvertQuotation,
  canMarkPaid,
  canSendDocument,
  isEditableStatus,
  isManuallySettableStatus,
  isValidStatus,
  requireConvertibleQuotation,
  requireEditableDocument,
  requireMarkPayableInvoice,
  requireSendableDocument,
  shouldMarkViewed,
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

describe("shouldMarkViewed", () => {
  it("is true from draft and sent — the two pre-viewed statuses", () => {
    expect(shouldMarkViewed("draft")).toBe(true);
    expect(shouldMarkViewed("sent")).toBe(true);
  });

  it("is false for every status a view must never regress", () => {
    // Once a document is at "viewed" or further along (paid, accepted,
    // cancelled, ...), opening the public link again must not touch it.
    const mustNotRegress = [...QUOTATION_STATUSES, ...INVOICE_STATUSES].filter(
      (status) => status !== "draft" && status !== "sent",
    );
    for (const status of mustNotRegress) {
      expect(shouldMarkViewed(status)).toBe(false);
    }
  });
});

describe("canSendDocument / requireSendableDocument", () => {
  it("blocks the terminal quotation statuses", () => {
    for (const status of ["declined", "expired", "converted"]) {
      expect(canSendDocument("quotation", status)).toBe(false);
      expect(() => requireSendableDocument("quotation", status)).toThrow(
        ForbiddenError,
      );
    }
  });

  it("blocks cancelled invoices", () => {
    expect(canSendDocument("invoice", "cancelled")).toBe(false);
    expect(() => requireSendableDocument("invoice", "cancelled")).toThrow(
      ForbiddenError,
    );
  });

  it("allows every other status of either type, including re-sends", () => {
    const sendableQuotationStatuses = QUOTATION_STATUSES.filter(
      (status) => !["declined", "expired", "converted"].includes(status),
    );
    for (const status of sendableQuotationStatuses) {
      expect(canSendDocument("quotation", status)).toBe(true);
      expect(() => requireSendableDocument("quotation", status)).not.toThrow();
    }

    const sendableInvoiceStatuses = INVOICE_STATUSES.filter(
      (status) => status !== "cancelled",
    );
    for (const status of sendableInvoiceStatuses) {
      expect(canSendDocument("invoice", status)).toBe(true);
      expect(() => requireSendableDocument("invoice", status)).not.toThrow();
    }
  });

  it("doesn't cross-apply one type's terminal statuses to the other", () => {
    // "cancelled" only blocks invoices; it isn't even a valid quotation
    // status, so it must not be treated as blocking there.
    expect(canSendDocument("quotation", "cancelled")).toBe(true);
  });
});

describe("canConvertQuotation / requireConvertibleQuotation", () => {
  it("blocks declined, expired, and already-converted quotations", () => {
    for (const status of ["declined", "expired", "converted"]) {
      expect(canConvertQuotation(status)).toBe(false);
      expect(() => requireConvertibleQuotation(status)).toThrow(ForbiddenError);
    }
  });

  it("allows every other quotation status, including accepted", () => {
    const convertible = QUOTATION_STATUSES.filter(
      (status) => !["declined", "expired", "converted"].includes(status),
    );
    for (const status of convertible) {
      expect(canConvertQuotation(status)).toBe(true);
      expect(() => requireConvertibleQuotation(status)).not.toThrow();
    }
    // Formal acceptance is a later product phase (see spec), so
    // conversion is never gated on having reached "accepted" specifically
    // — it's just one of the many non-terminal statuses that's allowed.
    expect(canConvertQuotation("accepted")).toBe(true);
  });
});

describe("canMarkPaid / requireMarkPayableInvoice", () => {
  it("blocks cancelled invoices", () => {
    expect(canMarkPaid("cancelled")).toBe(false);
    expect(() => requireMarkPayableInvoice("cancelled")).toThrow(ForbiddenError);
  });

  it("allows every other invoice status, including an already-paid one (idempotent)", () => {
    const markable = INVOICE_STATUSES.filter((status) => status !== "cancelled");
    for (const status of markable) {
      expect(canMarkPaid(status)).toBe(true);
      expect(() => requireMarkPayableInvoice(status)).not.toThrow();
    }
  });
});
