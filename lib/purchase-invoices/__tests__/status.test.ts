import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/auth/errors";
import {
  PURCHASE_INVOICE_STATUSES,
  canApprovePurchaseInvoice,
  canCancelPurchaseInvoice,
  deriveVendorInvoiceStatus,
  isEditablePurchaseInvoice,
  requireApprovablePurchaseInvoice,
  requireCancellablePurchaseInvoice,
  requireEditablePurchaseInvoice,
} from "@/lib/purchase-invoices/status";

describe("isEditablePurchaseInvoice", () => {
  it("is true only for received — the vocabulary's editable state, not a lock", () => {
    expect(isEditablePurchaseInvoice("received")).toBe(true);
  });

  it("is false for every other status", () => {
    for (const status of PURCHASE_INVOICE_STATUSES) {
      if (status === "received") continue;
      expect(isEditablePurchaseInvoice(status)).toBe(false);
    }
  });
});

describe("requireEditablePurchaseInvoice", () => {
  it("does not throw for received", () => {
    expect(() => requireEditablePurchaseInvoice("received")).not.toThrow();
  });

  it("throws ForbiddenError once approved", () => {
    expect(() => requireEditablePurchaseInvoice("approved")).toThrow(ForbiddenError);
  });
});

describe("canApprovePurchaseInvoice / requireApprovablePurchaseInvoice", () => {
  it("only received can be approved", () => {
    expect(canApprovePurchaseInvoice("received")).toBe(true);
    for (const status of PURCHASE_INVOICE_STATUSES) {
      if (status === "received") continue;
      expect(canApprovePurchaseInvoice(status)).toBe(false);
    }
  });

  it("throws for an already-approved invoice — no re-approval", () => {
    expect(() => requireApprovablePurchaseInvoice("approved")).toThrow(ForbiddenError);
  });
});

describe("canCancelPurchaseInvoice / requireCancellablePurchaseInvoice", () => {
  it("received and approved can be cancelled", () => {
    expect(canCancelPurchaseInvoice("received")).toBe(true);
    expect(canCancelPurchaseInvoice("approved")).toBe(true);
  });

  it("paid, partially_paid, and cancelled cannot be cancelled", () => {
    expect(canCancelPurchaseInvoice("paid")).toBe(false);
    expect(canCancelPurchaseInvoice("partially_paid")).toBe(false);
    expect(canCancelPurchaseInvoice("cancelled")).toBe(false);
  });

  it("throws for a cancelled invoice — a dead end, not reversible", () => {
    expect(() => requireCancellablePurchaseInvoice("cancelled")).toThrow(ForbiddenError);
  });
});

describe("deriveVendorInvoiceStatus", () => {
  it("stays received regardless of payment figures — received is pre-approval", () => {
    expect(deriveVendorInvoiceStatus("received", 1000, 1000)).toBe("received");
  });

  it("stays cancelled — a dead end", () => {
    expect(deriveVendorInvoiceStatus("cancelled", 1000, 0)).toBe("cancelled");
  });

  it("returns approved when nothing has been paid yet", () => {
    expect(deriveVendorInvoiceStatus("approved", 1000, 0)).toBe("approved");
  });

  it("returns partially_paid for a partial payment", () => {
    expect(deriveVendorInvoiceStatus("approved", 1000, 400)).toBe("partially_paid");
  });

  it("returns paid once amountPaid reaches total", () => {
    expect(deriveVendorInvoiceStatus("partially_paid", 1000, 1000)).toBe("paid");
  });

  it("returns paid for an overpayment too", () => {
    expect(deriveVendorInvoiceStatus("partially_paid", 1000, 1200)).toBe("paid");
  });
});
