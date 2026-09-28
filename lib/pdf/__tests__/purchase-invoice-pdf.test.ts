import { describe, expect, it } from "vitest";
import { renderPurchaseInvoicePdf } from "@/lib/pdf/purchase-invoice-render";
import type { PurchaseInvoicePdfData } from "@/lib/pdf/purchase-invoice-pdf";

// Smoke test: react-pdf layout/font issues (a bad flex width, a missing
// glyph, an unhandled null) surface only at render time, never at
// typecheck — this is the one cheap check that the renderer actually
// produces a real PDF for realistic data, mirroring the reference
// invoice's own shape (dual FC/INR columns, mixed GST rates, shipment
// details, bank details).
const BASE_DATA: PurchaseInvoicePdfData = {
  vendorInvoiceNumber: "POL/2026/0142",
  vendorInvoiceDate: new Date("2026-01-15"),
  dueDate: new Date("2026-02-15"),
  currency: "INR",
  exchangeRate: null,
  roundTotal: true,
  taxableAmount: 37200,
  cgst: 3348,
  sgst: 3348,
  igst: 0,
  cess: 0,
  total: 43896.59,
  shipmentMode: "SEA FREIGHT EXPORT FCL",
  vesselVoyage: "MSC ANNA / 234W",
  sailedDate: new Date("2026-01-10"),
  portOfLoading: "Chennai",
  portOfDischarge: "Jebel Ali",
  originPort: "Chennai",
  placeOfDelivery: "Dubai",
  shipper: "EMAJ Freight",
  ciReference: "CI-2026-004",
  salesPerson: "R. Kumar",
  containerNo: "MSCU1234567",
  jobRef: "JOB-2026-0091",
  customerRef: "PO-9981",
  packageType: "Pallets",
  noOfPackages: 12,
  hbl: "HBL12345",
  mbl: "MBL98765",
  weightKg: 24500,
  chargeableWeight: 25000,
  volumeCbm: 68.5,
  customsDocRef: "SB-2026-1122",
  termsOfShipment: "CIF",
  vendor: {
    name: "Pacific Ocean Logistics",
    email: "accounts@pacificocean.example",
    phone: "+91 98765 43210",
    address: "12 Harbour Road",
    city: "Chennai",
    state: "Tamil Nadu",
    gstin: "33AABCP1234R1ZX",
    pan: "AABCP1234R",
    cin: "U63090TN2010PTC012345",
    bankName: "HDFC Bank",
    accountHolderName: "Pacific Ocean Logistics Pvt Ltd",
    accountNumber: "50100123456789",
    ifscCode: "HDFC0001234",
    upiId: null,
    swiftCode: "HDFCINBB",
  },
  business: {
    name: "EMAJ Freight",
    email: "hello@emaj.example",
    phone: "+91 98765 00000",
    address: "45 Anna Salai",
    city: "Chennai",
    state: "Tamil Nadu",
    country: "India",
    website: null,
    logoUrl: null,
    gstEnabled: true,
    gstin: "33AABCE9603R1ZX",
    placeOfSupply: "Tamil Nadu",
    registrationType: "Regular",
    bankName: null,
    accountHolderName: null,
    accountNumber: null,
    ifscCode: null,
    upiId: null,
    pan: null,
    tan: null,
    cin: null,
    swiftCode: null,
    signatureImageUrl: null,
    signatureSignatoryName: null,
    signatureDesignation: null,
    logoSize: "md",
    signatureSize: "md",
  },
  lineItems: [
    {
      description: "Ocean Freight Charges",
      sac: "996521",
      qty: 1,
      unit: "Shipment",
      rate: 32000,
      amount: 32000,
      amountInr: null,
      taxableAmount: 32000,
      gstRate: 18,
      cgst: 2880,
      sgst: 2880,
      igst: 0,
      cess: 0,
      rateFC: null,
      exRate: null,
      fcCurrency: null,
      amountFC: null,
    },
    {
      description: "Documentation Charges",
      sac: "996729",
      qty: 1,
      unit: "Shipment",
      rate: 5200,
      amount: 5200,
      amountInr: null,
      taxableAmount: 5200,
      gstRate: 9,
      cgst: 468,
      sgst: 468,
      igst: 0,
      cess: 0,
      rateFC: null,
      exRate: null,
      fcCurrency: null,
      amountFC: null,
    },
  ],
};

describe("renderPurchaseInvoicePdf", () => {
  it("renders a real, non-empty PDF for a realistic multi-rate invoice", async () => {
    const buffer = await renderPurchaseInvoicePdf(BASE_DATA);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("renders with foreign-currency dual FC/INR columns", async () => {
    const buffer = await renderPurchaseInvoicePdf({
      ...BASE_DATA,
      currency: "USD",
      exchangeRate: 83.25,
      lineItems: BASE_DATA.lineItems.map((item) => ({
        ...item,
        amountInr: item.amount * 83.25,
      })),
    });
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("shows FC columns driven by a line item's own rateFC/exRate/amountFC/fcCurrency, even when the invoice's own currency stays INR", async () => {
    const buffer = await renderPurchaseInvoicePdf({
      ...BASE_DATA,
      currency: "INR",
      exchangeRate: null,
      lineItems: [
        {
          ...BASE_DATA.lineItems[0]!,
          rateFC: 384,
          exRate: 83.25,
          fcCurrency: "USD",
          amountFC: 384,
        },
      ],
    });
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("shows FC columns when a line item has amountInr set, even if the invoice's own currency is still INR — the defensive detection added alongside the invoice-level check", async () => {
    const buffer = await renderPurchaseInvoicePdf({
      ...BASE_DATA,
      currency: "INR",
      exchangeRate: null,
      lineItems: [{ ...BASE_DATA.lineItems[0]!, amountInr: BASE_DATA.lineItems[0]!.amount * 1.1 }],
    });
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("renders with no shipment fields and a single line item (minimal invoice)", async () => {
    const buffer = await renderPurchaseInvoicePdf({
      ...BASE_DATA,
      shipmentMode: null,
      vesselVoyage: null,
      sailedDate: null,
      portOfLoading: null,
      portOfDischarge: null,
      originPort: null,
      placeOfDelivery: null,
      shipper: null,
      ciReference: null,
      salesPerson: null,
      containerNo: null,
      jobRef: null,
      customerRef: null,
      packageType: null,
      noOfPackages: null,
      hbl: null,
      mbl: null,
      weightKg: null,
      chargeableWeight: null,
      volumeCbm: null,
      customsDocRef: null,
      termsOfShipment: null,
      lineItems: [BASE_DATA.lineItems[0]!],
    });
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });
});
