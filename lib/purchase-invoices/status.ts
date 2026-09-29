import type { PurchaseInvoiceStatus } from "@prisma/client";
import { ForbiddenError } from "@/lib/auth/errors";

// See docs/accounts-payable-phase1-design.md §2. One flat vocabulary
// (unlike lib/documents/status.ts's per-DocumentType split), so a real
// Postgres enum is the right call here — see that section's own
// reasoning.
export const PURCHASE_INVOICE_STATUSES: readonly PurchaseInvoiceStatus[] = [
  "received",
  "approved",
  "partially_paid",
  "paid",
  "cancelled",
];

// received is the editable state — the vocabulary's own starting point,
// playing the role `draft` plays for Document. Locked from `approved`
// onward. See design doc §2's explicit "can Staff edit their own
// received invoice?" answer: yes, received is NOT itself a lock.
export function isEditablePurchaseInvoice(status: PurchaseInvoiceStatus): boolean {
  return status === "received";
}

export function requireEditablePurchaseInvoice(status: PurchaseInvoiceStatus): void {
  if (!isEditablePurchaseInvoice(status)) {
    throw new ForbiddenError(
      "This purchase invoice is no longer editable — only invoices in \"received\" status can be changed.",
    );
  }
}

// received -> approved is the one deliberate one-way review step (design
// doc §2's status flow table). No "un-approve" — see §9.
export function canApprovePurchaseInvoice(status: PurchaseInvoiceStatus): boolean {
  return status === "received";
}

export function requireApprovablePurchaseInvoice(status: PurchaseInvoiceStatus): void {
  if (!canApprovePurchaseInvoice(status)) {
    throw new ForbiddenError(
      `This purchase invoice can't be approved in its current status ("${status}").`,
    );
  }
}

// received/approved -> cancelled is a dead end — a cancelled invoice
// can't be paid or re-approved (design doc §2).
export function canCancelPurchaseInvoice(status: PurchaseInvoiceStatus): boolean {
  return status === "received" || status === "approved";
}

export function requireCancellablePurchaseInvoice(status: PurchaseInvoiceStatus): void {
  if (!canCancelPurchaseInvoice(status)) {
    throw new ForbiddenError(
      `This purchase invoice can't be cancelled in its current status ("${status}").`,
    );
  }
}

// A received (unapproved) invoice has nothing real to pay against yet —
// same "draft has no recordable payment" reasoning as
// lib/documents/status.ts's canRecordPayment — and a cancelled one is a
// dead end. Every other status (including an already-fully-paid
// invoice — overpayment becomes credit, see creditBalance below) is
// fair game. See docs/accounts-payable-phase1-design.md §7.
export function canRecordVendorPayment(status: PurchaseInvoiceStatus): boolean {
  return status !== "received" && status !== "cancelled";
}

export function requireRecordableVendorPayment(status: PurchaseInvoiceStatus): void {
  if (!canRecordVendorPayment(status)) {
    throw new ForbiddenError(
      `Payments can't be recorded on this purchase invoice in its current status ("${status}").`,
    );
  }
}

// remainingBalance/creditBalance are the exact same two pure functions
// lib/documents/status.ts already exports, un-opinionated about
// direction (design doc §7) — reused directly there, not reimplemented
// here.

// Mirrors lib/documents/status.ts's deriveInvoiceStatus() — same shape,
// AP vocabulary. Called only inside the same transaction as every
// VendorPayment create/reverse (Stage c), never recomputed lazily at
// read time.
export function deriveVendorInvoiceStatus(
  currentStatus: PurchaseInvoiceStatus,
  total: number,
  amountPaid: number,
): PurchaseInvoiceStatus {
  if (currentStatus === "received" || currentStatus === "cancelled") {
    return currentStatus;
  }
  if (amountPaid >= total) return "paid"; // includes the overpaid case
  if (amountPaid > 0) return "partially_paid";
  return "approved";
}
