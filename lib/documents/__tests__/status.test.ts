import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/auth/errors";
import {
  INVOICE_STATUSES,
  PROFORMA_STATUSES,
  QUOTATION_STATUSES,
  canConvertQuotation,
  canFinalizeDocument,
  canRecordPayment,
  canSendDocument,
  creditBalance,
  deriveInvoiceStatus,
  isEditableStatus,
  isManuallySettableStatus,
  isOverdue,
  isValidStatus,
  remainingBalance,
  requireConvertibleQuotation,
  requireEditableDocument,
  requireFinalizableDocument,
  requireRecordablePaymentInvoice,
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
    const restricted = [
      "sent",
      "viewed",
      "paid",
      "partially_paid",
      "accepted",
      "converted",
      "finalized",
    ];
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

describe("canFinalizeDocument / requireFinalizableDocument", () => {
  it("allows only draft", () => {
    expect(canFinalizeDocument("draft")).toBe(true);
    expect(() => requireFinalizableDocument("draft")).not.toThrow();
  });

  it("blocks every other invoice/proforma status, including finalized itself — a one-way door", () => {
    for (const status of [...INVOICE_STATUSES, ...PROFORMA_STATUSES]) {
      if (status === "draft") continue;
      expect(canFinalizeDocument(status)).toBe(false);
      expect(() => requireFinalizableDocument(status)).toThrow(ForbiddenError);
    }
  });
});

describe("canRecordPayment / requireRecordablePaymentInvoice", () => {
  it("blocks draft and cancelled invoices", () => {
    for (const status of ["draft", "cancelled"]) {
      expect(canRecordPayment(status)).toBe(false);
      expect(() => requireRecordablePaymentInvoice(status)).toThrow(
        ForbiddenError,
      );
    }
  });

  it("allows every other invoice status, including an already-paid one (overpayment becomes credit)", () => {
    const recordable = INVOICE_STATUSES.filter(
      (status) => status !== "draft" && status !== "cancelled",
    );
    for (const status of recordable) {
      expect(canRecordPayment(status)).toBe(true);
      expect(() => requireRecordablePaymentInvoice(status)).not.toThrow();
    }
  });
});

describe("deriveInvoiceStatus", () => {
  it("leaves draft and cancelled untouched regardless of amountPaid", () => {
    expect(deriveInvoiceStatus("draft", 100, 100)).toBe("draft");
    expect(deriveInvoiceStatus("cancelled", 100, 100)).toBe("cancelled");
  });

  it("is paid once amountPaid reaches or exceeds total, including overpayment", () => {
    expect(deriveInvoiceStatus("sent", 100, 100)).toBe("paid");
    expect(deriveInvoiceStatus("sent", 100, 150)).toBe("paid");
  });

  it("is partially_paid for any positive amount short of total", () => {
    expect(deriveInvoiceStatus("sent", 100, 1)).toBe("partially_paid");
    expect(deriveInvoiceStatus("paid", 100, 99)).toBe("partially_paid");
  });

  it("resolves to sent, not draft, once amountPaid returns to zero", () => {
    expect(deriveInvoiceStatus("paid", 100, 0)).toBe("sent");
    expect(deriveInvoiceStatus("partially_paid", 100, 0)).toBe("sent");
  });
});

describe("remainingBalance / creditBalance", () => {
  it("remainingBalance is total minus amountPaid, never negative", () => {
    expect(remainingBalance(100, 40)).toBe(60);
    expect(remainingBalance(100, 100)).toBe(0);
    expect(remainingBalance(100, 150)).toBe(0);
  });

  it("creditBalance is the excess over total, zero otherwise", () => {
    expect(creditBalance(100, 150)).toBe(50);
    expect(creditBalance(100, 100)).toBe(0);
    expect(creditBalance(100, 40)).toBe(0);
  });

  it("are complementary — exactly one is nonzero at a time", () => {
    expect(remainingBalance(100, 150)).toBe(0);
    expect(creditBalance(100, 40)).toBe(0);
  });
});

describe("proforma — smallest vocabulary of the three, no payment/convert semantics", () => {
  it("has exactly draft/finalized/sent/viewed/cancelled — no accepted/converted/paid/partially_paid/overdue", () => {
    expect([...PROFORMA_STATUSES].sort()).toEqual(
      ["cancelled", "draft", "finalized", "sent", "viewed"].sort(),
    );
  });

  it("isValidStatus accepts its own vocabulary and rejects the others'", () => {
    for (const status of PROFORMA_STATUSES) {
      expect(isValidStatus("proforma", status)).toBe(true);
    }
    expect(isValidStatus("proforma", "paid")).toBe(false);
    expect(isValidStatus("proforma", "converted")).toBe(false);
    expect(isValidStatus("proforma", "accepted")).toBe(false);
  });

  it("only draft and cancelled are manually settable, same shape as invoice", () => {
    expect(isManuallySettableStatus("proforma", "draft")).toBe(true);
    expect(isManuallySettableStatus("proforma", "cancelled")).toBe(true);
    expect(isManuallySettableStatus("proforma", "sent")).toBe(false);
    expect(isManuallySettableStatus("proforma", "viewed")).toBe(false);
  });

  it("draft is editable, everything else is not", () => {
    expect(isEditableStatus("draft")).toBe(true);
    for (const status of PROFORMA_STATUSES) {
      if (status === "draft") continue;
      expect(isEditableStatus(status)).toBe(false);
    }
  });

  it("can be sent from every status except cancelled — a proforma is never a Send-triggers-payment-follow-up instrument, but sending itself still works", () => {
    for (const status of PROFORMA_STATUSES) {
      if (status === "cancelled") continue;
      expect(canSendDocument("proforma", status)).toBe(true);
    }
    expect(canSendDocument("proforma", "cancelled")).toBe(false);
  });

  // canRecordPayment/canConvertQuotation are plain status-string
  // functions (see lib/documents/status.ts), not DocumentType-aware —
  // the real "proformas never take payments/never convert" guarantee
  // lives in the UI (document-preview.tsx gates both on the document's
  // *type*, isInvoice/isQuotation respectively, not just on status) and
  // server-side (payments/route.ts, reverse-last/route.ts, and
  // convert/route.ts each explicitly reject any type other than
  // "invoice"/"quotation"). Nothing here would stop canRecordPayment("sent")
  // from returning true for a proforma's "sent" status if it were ever
  // called for one — it's simply never called for one.
});

describe("isOverdue", () => {
  const past = new Date(Date.now() - 86_400_000);
  const future = new Date(Date.now() + 86_400_000);

  it("is true only for sent/partially_paid, past due date, with a remaining balance", () => {
    expect(isOverdue("sent", past, 50)).toBe(true);
    expect(isOverdue("partially_paid", past, 50)).toBe(true);
  });

  it("is false once fully paid even if the due date has passed", () => {
    expect(isOverdue("paid", past, 0)).toBe(false);
    expect(isOverdue("sent", past, 0)).toBe(false);
  });

  it("is false before the due date", () => {
    expect(isOverdue("sent", future, 50)).toBe(false);
  });

  it("is false with no due date at all", () => {
    expect(isOverdue("sent", null, 50)).toBe(false);
  });

  it("is false for draft/cancelled/paid/converted/etc.", () => {
    for (const status of ["draft", "cancelled", "paid", "viewed"]) {
      expect(isOverdue(status, past, 50)).toBe(false);
    }
  });
});
