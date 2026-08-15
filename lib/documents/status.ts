import type { DocumentType } from "@prisma/client";

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
