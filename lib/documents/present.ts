import type { Document, LineItem, Payment, User } from "@prisma/client";
import { creditBalance, remainingBalance } from "@/lib/documents/status";
import type {
  BusinessSnapshot,
  CustomerSnapshot,
} from "@/lib/documents/snapshots";
import type { PreviewDocument } from "@/components/documents/preview-types";

// The single place that turns a Document row (+ its lineItems, sorted by
// the caller's query — see orderBy: { sortOrder: "asc" }) into the plain,
// Decimal-free shape every other Phase 7/8 surface renders from: the
// in-app preview, PDF generation, the public share view, and the send
// email. Totals and snapshots are read straight off the row, never
// recomputed — same frozen-at-save-time rule as everywhere else.
export function toPreviewDocument(
  document: Document & {
    lineItems: LineItem[];
    // Optional: only the in-app preview page's query includes this
    // relation (PDF/send/public routes don't need it) — defaults to null.
    convertedToInvoice?: { id: string; number: string } | null;
    // Optional: defaults to [] for callers that don't need payment
    // history (e.g. a route only reading totals). Always sorted newest
    // first by the caller — see docs/payment-tracking-design.md §1/§6.
    payments?: (Payment & { recordedBy: User | null })[];
  },
): PreviewDocument {
  const total = Number(document.total);
  const amountPaid = Number(document.amountPaid);
  return {
    id: document.id,
    type: document.type,
    number: document.number,
    status: document.status,
    issueDate: document.issueDate.toISOString(),
    dueDate: document.dueDate?.toISOString() ?? null,
    validUntil: document.validUntil?.toISOString() ?? null,
    paymentTerms: document.paymentTerms,
    validityTerms: document.validityTerms,
    notes: document.notes,
    termsText: document.termsText,
    referenceNumber: document.referenceNumber,
    currency: document.currency,
    template: document.template,
    accentColor: document.accentColor,
    showLogo: document.showLogo,
    showGstinRow: document.showGstinRow,
    showTax: document.showTax,
    showPayment: document.showPayment,
    showNotes: document.showNotes,
    showTerms: document.showTerms,
    showReferenceNumber: document.showReferenceNumber,
    // Snapshots are stored as Json — cast back to the shape they were
    // always written in (see lib/documents/snapshots.ts).
    business: document.businessSnapshot as unknown as BusinessSnapshot,
    customer: document.customerSnapshot as unknown as CustomerSnapshot,
    lineItems: document.lineItems.map((item) => ({
      name: item.name,
      description: item.description ?? "",
      qty: Number(item.qty),
      rate: Number(item.rate),
      gstRate: item.gstRate == null ? null : Number(item.gstRate),
      amount: Number(item.amount),
    })),
    totals: {
      subtotal: Number(document.subtotal),
      discountTotal: Number(document.discountTotal),
      taxableAmount: Number(document.taxableAmount),
      cgst: Number(document.cgst),
      sgst: Number(document.sgst),
      igst: Number(document.igst),
      total: Number(document.total),
    },
    payments: (document.payments ?? []).map((payment) => ({
      id: payment.id,
      amount: Number(payment.amount),
      paidAt: payment.paidAt.toISOString(),
      note: payment.note,
      recordedByName: payment.recordedBy?.name ?? payment.recordedBy?.email ?? null,
    })),
    amountPaid,
    remainingBalance: remainingBalance(total, amountPaid),
    creditBalance: creditBalance(total, amountPaid),
    convertedToInvoice: document.convertedToInvoice ?? null,
  };
}
