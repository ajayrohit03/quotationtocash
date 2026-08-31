import type { DocumentType, Prisma } from "@prisma/client";
import { ForbiddenError } from "@/lib/auth/errors";

// Document.status is a plain String column (see schema.prisma), not a DB
// enum — quotations and invoices have different, mutually exclusive
// status vocabularies that a single Postgres enum can't express without
// allowing invalid states on one type or the other. Validated here
// instead, on every write.

export const QUOTATION_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
  "converted",
] as const;

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
] as const;

export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type DocumentStatus = QuotationStatus | InvoiceStatus;

const STATUSES_BY_TYPE: Record<DocumentType, readonly string[]> = {
  quotation: QUOTATION_STATUSES,
  invoice: INVOICE_STATUSES,
};

export function isValidStatus(type: DocumentType, status: string): boolean {
  return STATUSES_BY_TYPE[type].includes(status);
}

// Statuses that must never be set through a general-purpose update — each
// has exactly one legitimate code path elsewhere in the app:
//   sent           -> POST /api/documents/:id/send                 (Phase 8)
//   viewed         -> GET  /public/documents/:token                 (Phase 8)
//   paid/partially_paid
//                  -> derived by deriveInvoiceStatus() below, written
//                     only by POST /api/documents/:id/payments and
//                     POST /api/documents/:id/payments/reverse-last
//                     (see docs/payment-tracking-design.md)
//   accepted       -> the public share view's accept action         (Phase 8/9)
//   converted      -> POST /api/documents/:id/convert                (Phase 9)
const RESTRICTED_STATUSES = new Set<string>([
  "sent",
  "viewed",
  "paid",
  "partially_paid",
  "accepted",
  "converted",
]);

// What a general-purpose edit (PATCH /api/documents/:id) is allowed to set
// `status` to directly. Everything else in each vocabulary either happens
// automatically (viewed, overdue) or through a dedicated endpoint above.
const MANUALLY_SETTABLE_STATUSES: Record<DocumentType, readonly string[]> = {
  quotation: ["draft", "declined", "expired"],
  invoice: ["draft", "cancelled"],
};

export function isManuallySettableStatus(
  type: DocumentType,
  status: string,
): boolean {
  return (
    !RESTRICTED_STATUSES.has(status) &&
    MANUALLY_SETTABLE_STATUSES[type].includes(status)
  );
}

// Whether a document's content (line items, customer, dates, terms,
// appearance) can still be edited. Once it's left `draft` — sent, viewed,
// accepted, paid, etc. — the builder shouldn't silently rewrite it.
export function isEditableStatus(status: string): boolean {
  return status === "draft";
}

// The single check PATCH and DELETE /api/documents/:id both apply before
// doing anything else with the document — one source of truth for "is
// this still editable" rather than two hand-written comparisons in two
// route files that could drift apart. Throws (rather than returning a
// boolean) so call sites don't have to remember to check a return value
// and short-circuit themselves; it's caught by the route's existing
// try/catch -> errorResponse() the same way AuthError/ForbiddenError from
// requireAuth()/requireBusiness() already are.
export function requireEditableDocument(status: string): void {
  if (!isEditableStatus(status)) {
    throw new ForbiddenError(
      "This document is no longer a draft and can't be edited or deleted.",
    );
  }
}

// Whether opening the public share link should bump status to "viewed".
// A document only ever moves forward through the vocabulary — from draft
// or sent — never regressed back from something further along (paid,
// accepted, cancelled, ...) just because the link was opened again.
export function shouldMarkViewed(status: string): boolean {
  return status === "draft" || status === "sent";
}

// A handful of terminal-ish statuses per type make POST
// /api/documents/:id/send nonsensical — a declined/expired/converted
// quotation or a cancelled invoice shouldn't be re-emailed.
const UNSENDABLE_STATUSES: Record<DocumentType, readonly string[]> = {
  quotation: ["declined", "expired", "converted"],
  invoice: ["cancelled"],
};

export function canSendDocument(type: DocumentType, status: string): boolean {
  return !UNSENDABLE_STATUSES[type].includes(status);
}

export function requireSendableDocument(
  type: DocumentType,
  status: string,
): void {
  if (!canSendDocument(type, status)) {
    throw new ForbiddenError(
      `This ${type} can't be sent in its current status ("${status}").`,
    );
  }
}

// A quotation that's already been declined, has expired, or was already
// converted can't be converted (again) — everything else (draft, sent,
// viewed, accepted) is fair game. Formal quote acceptance/e-signature is
// a later product-roadmap phase (see spec), not this build's Phase 9, so
// for now conversion is the business owner's own call rather than being
// gated on the quotation having reached "accepted".
const UNCONVERTIBLE_QUOTATION_STATUSES = new Set<string>([
  "declined",
  "expired",
  "converted",
]);

export function canConvertQuotation(status: string): boolean {
  return !UNCONVERTIBLE_QUOTATION_STATUSES.has(status);
}

export function requireConvertibleQuotation(status: string): void {
  if (!canConvertQuotation(status)) {
    throw new ForbiddenError(
      `This quotation can't be converted in its current status ("${status}").`,
    );
  }
}

// See docs/payment-tracking-design.md §2. A draft invoice was never
// sent to the customer, so there's nothing real to record a payment
// against yet; a cancelled one is a dead end. Every other status
// (including an already-fully-paid invoice — overpayment becomes
// credit, see creditBalance() below) is fair game.
export function canRecordPayment(status: string): boolean {
  return status !== "draft" && status !== "cancelled";
}

export function requireRecordablePaymentInvoice(status: string): void {
  if (!canRecordPayment(status)) {
    throw new ForbiddenError(
      `Payments can't be recorded on this invoice in its current status ("${status}").`,
    );
  }
}

// §3 of the design doc. Called inside the same transaction as every
// payment create/reverse — status only ever changes in response to a
// payment mutation, never recomputed lazily at read time.
export function deriveInvoiceStatus(
  currentStatus: string,
  total: number,
  amountPaid: number,
): InvoiceStatus {
  if (currentStatus === "draft" || currentStatus === "cancelled") {
    return currentStatus as InvoiceStatus;
  }
  if (amountPaid >= total) return "paid"; // includes the overpaid case
  if (amountPaid > 0) return "partially_paid";
  // Reversing every payment lands here — "sent", not "draft". Draft
  // would silently reopen line-item editing on an invoice that already
  // went out; "sent" is the correct "billed, currently unpaid" state
  // and isn't editable (see isEditableStatus above).
  return "sent";
}

// Never negative — an invoice can't owe less than nothing.
export function remainingBalance(total: number, amountPaid: number): number {
  return Math.max(0, total - amountPaid);
}

// The amount paid in excess of the invoice's total. Purely an
// informational tracked-balance figure — NOT a document, NOT applied
// automatically to any future invoice, and NOT a GST credit note
// (a distinct, separately-regulated document type under Indian GST
// law). See docs/payment-tracking-design.md §3 for the explicit
// boundary; nothing here should be read as satisfying that need.
export function creditBalance(total: number, amountPaid: number): number {
  return Math.max(0, amountPaid - total);
}

// Builds the WHERE clause for a status filter from the document list
// pages / GET /api/documents — "overdue" isn't a stored value (see
// isOverdue() below), so filtering by it means the date/amount overlay
// condition instead of a plain status match. Everything else is a plain
// `{ status }` as before.
export function documentStatusFilterWhere(
  status: string,
): Prisma.DocumentWhereInput {
  if (status !== "overdue") {
    return status ? { status } : {};
  }
  return {
    status: { in: ["sent", "partially_paid"] },
    dueDate: { lt: new Date() },
  };
}

// Display/filter-only — never written to the `status` column. Nothing
// in this app runs a background job, so "overdue" is computed fresh
// wherever it's shown or queried rather than persisted and left to go
// stale. See docs/payment-tracking-design.md §3.
export function isOverdue(
  status: string,
  dueDate: Date | null,
  remaining: number,
): boolean {
  return (
    (status === "sent" || status === "partially_paid") &&
    dueDate !== null &&
    dueDate.getTime() < Date.now() &&
    remaining > 0
  );
}
