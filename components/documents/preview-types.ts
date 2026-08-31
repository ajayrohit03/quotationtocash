import type { DocumentTemplate, DocumentType } from "@prisma/client";
import type {
  BusinessSnapshot,
  CustomerSnapshot,
} from "@/lib/documents/snapshots";

// Client-safe shape for the preview screen. Like BuilderProduct/BuilderDocument
// (see types.ts), every Decimal field is converted to a plain number before
// crossing the Server -> Client boundary. Totals are read directly off the
// Document row (not recomputed) — they're the frozen result of the last save,
// consistent with the snapshot/historical-immutability pattern.
export type PreviewLineItem = {
  name: string;
  description: string;
  qty: number;
  rate: number;
  gstRate: number | null;
  amount: number;
};

export type PreviewTotals = {
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

// See docs/payment-tracking-design.md §1/§3. `amountPaid` is read
// directly off the Document row (maintained, not summed live);
// `remainingBalance`/`creditBalance` are cheap arithmetic derived from
// it and `total` at the same conversion point (toPreviewDocument), so
// every consuming surface reads identical numbers.
export type PreviewPayment = {
  id: string;
  amount: number;
  paidAt: string;
  note: string | null;
  // Resolved name, in-app only — never sent to the public
  // share/PDF surfaces. See §6's customer-facing-visibility boundary.
  recordedByName: string | null;
};

export type PreviewAppearance = {
  template: DocumentTemplate;
  accentColor: string;
  showLogo: boolean;
  showGstinRow: boolean;
  showTax: boolean;
  showPayment: boolean;
  showNotes: boolean;
  showTerms: boolean;
  showReferenceNumber: boolean;
};

export type PreviewDocument = PreviewAppearance & {
  id: string;
  type: DocumentType;
  number: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  validUntil: string | null;
  paymentTerms: string | null;
  validityTerms: string | null;
  notes: string | null;
  termsText: string | null;
  referenceNumber: string | null;
  currency: string;
  business: BusinessSnapshot;
  customer: CustomerSnapshot;
  lineItems: PreviewLineItem[];
  totals: PreviewTotals;
  // Empty for quotations — always [] there, never null.
  payments: PreviewPayment[];
  amountPaid: number;
  remainingBalance: number;
  creditBalance: number;
  // Set only for a converted quotation — lets the preview link straight
  // to the invoice it became instead of dead-ending at "converted".
  convertedToInvoice: { id: string; number: string } | null;
};
