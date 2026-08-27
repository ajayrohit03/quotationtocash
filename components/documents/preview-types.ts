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

export type PreviewAppearance = {
  template: DocumentTemplate;
  accentColor: string;
  showLogo: boolean;
  showGstinRow: boolean;
  showTax: boolean;
  showPayment: boolean;
  showNotes: boolean;
  showTerms: boolean;
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
  currency: string;
  business: BusinessSnapshot;
  customer: CustomerSnapshot;
  lineItems: PreviewLineItem[];
  totals: PreviewTotals;
  // Set only for a converted quotation — lets the preview link straight
  // to the invoice it became instead of dead-ending at "converted".
  convertedToInvoice: { id: string; number: string } | null;
};
