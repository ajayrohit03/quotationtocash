import { describe, expect, it } from "vitest";
import { renderDocumentPdf } from "@/lib/pdf/render";
import type { PreviewDocument } from "@/components/documents/preview-types";

// Smoke test: react-pdf layout/font issues surface only at render
// time, never at typecheck. Covers Enhancement 1 (Swift code on
// export invoices' PAYMENT DETAILS block) — exercised via a real
// render with business.swiftCode set and currency != INR, confirming
// it doesn't crash. The actual visual output isn't asserted here
// (text isn't extractable from the PDF binary this way); the client
// verifies that visually per their own stated plan.

const business: PreviewDocument["business"] = {
  name: "Ajar Consultancy",
  email: "hello@ajar.example",
  phone: "+91 98765 43210",
  address: "12 MG Road",
  city: "Bengaluru",
  state: "Karnataka",
  country: "India",
  website: null,
  logoUrl: null,
  gstEnabled: true,
  gstin: "29AABCU9603R1ZX",
  placeOfSupply: "Karnataka",
  registrationType: "Regular",
  bankName: "HDFC Bank",
  accountHolderName: "Ajar Consultancy",
  accountNumber: "1234567890",
  ifscCode: "HDFC0001234",
  upiId: "ajar@upi",
  pan: "ABCDE1234F",
  tan: null,
  cin: null,
  swiftCode: "HDFCINBB",
  signatureImageUrl: null,
  signatureSignatoryName: null,
  signatureDesignation: null,
};

const customer: PreviewDocument["customer"] = {
  name: "Global Buyer Inc",
  company: "Global Buyer Inc",
  email: "buyer@global.example",
  phone: null,
  address: "1 Main St",
  city: "New York",
  state: null,
  gstin: null,
};

function makeDocument(overrides: Partial<PreviewDocument> = {}): PreviewDocument {
  return {
    id: "doc-1",
    type: "invoice",
    number: "INV-2026-0001",
    status: "sent",
    issueDate: "2026-09-19T00:00:00.000Z",
    dueDate: null,
    validUntil: null,
    paymentTerms: "Net 15",
    validityTerms: null,
    notes: null,
    termsText: null,
    referenceNumber: null,
    currency: "USD",
    inrExchangeRate: null,
    lutDeclarationText:
      "Supply meant for export under Letter of Undertaking (LUT) without payment of Integrated Tax.",
    business,
    customer,
    customFieldValues: [],
    lineItems: [
      {
        name: "Consulting services",
        description: "",
        sac: "998314",
        qty: 2,
        rate: 500,
        gstRate: 0,
        amount: 1000,
        foreignCurrency: null,
        foreignRate: null,
        exchangeRate: null,
        customFieldValues: [],
      },
    ],
    totals: {
      subtotal: 1000,
      discountTotal: 0,
      taxableAmount: 1000,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total: 1000,
    },
    payments: [],
    amountPaid: 0,
    remainingBalance: 1000,
    creditBalance: 0,
    convertedToInvoice: null,
    template: "classic",
    accentColor: "#4F46E5",
    showLogo: true,
    showGstinRow: true,
    showTax: true,
    showPayment: true,
    showNotes: true,
    showTerms: true,
    showReferenceNumber: false,
    showSignature: true,
    showDiscount: true,
    roundTotal: false,
    showInrEquivalent: false,
    fontSize: null,
    logoSize: "md",
    signatureSize: "md",
    einvoiceStatus: "none",
    irn: null,
    irnGeneratedAt: null,
    irnAckNo: null,
    irnAckDate: null,
    einvoiceQrCode: null,
    ...overrides,
  };
}

describe("renderDocumentPdf — export invoice (USD)", () => {
  it("renders with Swift code present in the business snapshot", async () => {
    const buffer = await renderDocumentPdf(makeDocument(), true);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("renders fine when swiftCode is blank — skipped, not a broken row", async () => {
    const buffer = await renderDocumentPdf(
      makeDocument({ business: { ...business, swiftCode: null } }),
      true,
    );
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("renders a plain INR invoice fine too (swiftCode never shown — not an export)", async () => {
    const buffer = await renderDocumentPdf(
      makeDocument({ currency: "INR", lutDeclarationText: null }),
      true,
    );
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });
});
