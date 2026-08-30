import type { DocumentType } from "@prisma/client";
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
//   sent      -> POST /api/documents/:id/send            (Phase 8)
//   viewed    -> GET  /public/documents/:token            (Phase 8)
//   paid      -> POST /api/documents/:id/mark-paid         (Phase 9)
//             <- POST /api/documents/:id/mark-unpaid        (Phase 9, reverse)
//   accepted  -> the public share view's accept action     (Phase 8/9)
//   converted -> POST /api/documents/:id/convert            (Phase 9)
const RESTRICTED_STATUSES = new Set<string>([
  "sent",
  "viewed",
  "paid",
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

// A cancelled invoice shouldn't be marked paid; every other status
// (including an already-paid invoice, harmlessly idempotent) is allowed.
export function canMarkPaid(status: string): boolean {
  return status !== "cancelled";
}

export function requireMarkPayableInvoice(status: string): void {
  if (!canMarkPaid(status)) {
    throw new ForbiddenError(
      `This invoice can't be marked paid in its current status ("${status}").`,
    );
  }
}

// The reverse of the above — only a currently-paid invoice can be
// reverted. Anything else (draft, sent, cancelled, ...) is rejected
// rather than silently no-op'd, since "mark unpaid" implies there was a
// paid state to undo.
export function canMarkUnpaid(status: string): boolean {
  return status === "paid";
}

export function requireMarkUnpaidInvoice(status: string): void {
  if (!canMarkUnpaid(status)) {
    throw new ForbiddenError(
      `This invoice can't be marked unpaid in its current status ("${status}").`,
    );
  }
}
