import { describe, expect, it } from "vitest";
import { buildIrpPayload } from "@/lib/einvoice/buildIrpPayload";
import type { PreviewDocument } from "@/components/documents/preview-types";

// Only the transformation is under test here — no IRP API call exists
// anywhere in this app yet (see buildIrpPayload.ts's own comment).

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
};

const sameStateCustomer: PreviewDocument["customer"] = {
  name: "Local Buyer Pvt Ltd",
  company: "Local Buyer Pvt Ltd",
  email: "buyer@local.example",
  phone: "+91 90000 11111",
  address: "22 Residency Road",
  city: "Bengaluru",
  state: "Karnataka",
  gstin: "29AABCU1234R1ZP",
};

const interStateCustomer: PreviewDocument["customer"] = {
  ...sameStateCustomer,
  state: "Maharashtra",
  gstin: "27AABCU1234R1ZQ",
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
    currency: "INR",
    inrExchangeRate: null,
    lutDeclarationText: null,
    business,
    customer: sameStateCustomer,
    customFieldValues: [],
    lineItems: [
      {
        name: "Consulting services",
        description: "",
        qty: 2,
        rate: 5000,
        gstRate: 18,
        amount: 10000,
        foreignCurrency: null,
        foreignRate: null,
        exchangeRate: null,
        customFieldValues: [],
      },
    ],
    totals: {
      subtotal: 10000,
      discountTotal: 0,
      taxableAmount: 10000,
      cgst: 900,
      sgst: 900,
      igst: 0,
      total: 11800,
    },
    payments: [],
    amountPaid: 0,
    remainingBalance: 11800,
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
    showReferenceNumber: true,
    showSignature: true,
    showInrEquivalent: false,
    fontSize: null,
    einvoiceStatus: "none",
    irn: null,
    irnGeneratedAt: null,
    irnAckNo: null,
    irnAckDate: null,
    einvoiceQrCode: null,
    ...overrides,
  };
}

describe("buildIrpPayload — basic INR invoice", () => {
  const payload = buildIrpPayload(makeDocument());

  it("sets the fixed top-level envelope fields", () => {
    expect(payload.Version).toBe("1.1");
    expect(payload.TranDtls.TaxSch).toBe("GST");
    expect(payload.TranDtls.SupTyp).toBe("B2B");
    expect(payload.DocDtls.Typ).toBe("INV");
  });

  it("formats DocDtls from the document's own number/date", () => {
    expect(payload.DocDtls.No).toBe("INV-2026-0001");
    expect(payload.DocDtls.Dt).toBe("19/09/2026");
  });

  it("builds SellerDtls from the business snapshot, including the correct state code", () => {
    expect(payload.SellerDtls.Gstin).toBe("29AABCU9603R1ZX");
    expect(payload.SellerDtls.LglNm).toBe("Ajar Consultancy");
    expect(payload.SellerDtls.Stcd).toBe("29"); // Karnataka
  });

  it("builds BuyerDtls from the customer snapshot, Pos matching Stcd for a same-state buyer", () => {
    expect(payload.BuyerDtls.Gstin).toBe("29AABCU1234R1ZP");
    expect(payload.BuyerDtls.Stcd).toBe("29");
    expect(payload.BuyerDtls.Pos).toBe("29");
  });

  it("splits same-state tax as CGST+SGST, not IGST", () => {
    const [item] = payload.ItemList;
    expect(item.CgstAmt).toBeGreaterThan(0);
    expect(item.SgstAmt).toBeGreaterThan(0);
    expect(item.IgstAmt).toBe(0);
  });

  it("one ItemList entry per line item, with quantity/rate/taxable value carried through", () => {
    expect(payload.ItemList).toHaveLength(1);
    const [item] = payload.ItemList;
    expect(item.SlNo).toBe("1");
    expect(item.PrdDesc).toBe("Consulting services");
    expect(item.Qty).toBe(2);
    expect(item.UnitPrice).toBe(5000);
    expect(item.AssAmt).toBe(10000);
    expect(item.GstRt).toBe(18);
  });

  it("ValDtls mirrors the document's own already-frozen totals, not a recomputation", () => {
    expect(payload.ValDtls.AssVal).toBe(10000);
    expect(payload.ValDtls.CgstVal).toBe(900);
    expect(payload.ValDtls.SgstVal).toBe(900);
    expect(payload.ValDtls.IgstVal).toBe(0);
    expect(payload.ValDtls.TotInvVal).toBe(11800);
  });
});

describe("buildIrpPayload — inter-state invoice (IGST)", () => {
  it("splits tax as IGST, not CGST+SGST, and Pos differs from the seller's own Stcd", () => {
    const payload = buildIrpPayload(
      makeDocument({
        customer: interStateCustomer,
        totals: {
          subtotal: 10000,
          discountTotal: 0,
          taxableAmount: 10000,
          cgst: 0,
          sgst: 0,
          igst: 1800,
          total: 11800,
        },
      }),
    );
    const [item] = payload.ItemList;
    expect(item.IgstAmt).toBeGreaterThan(0);
    expect(item.CgstAmt).toBe(0);
    expect(item.SgstAmt).toBe(0);
    expect(payload.BuyerDtls.Pos).toBe("27"); // Maharashtra
    expect(payload.SellerDtls.Stcd).toBe("29"); // Karnataka — unchanged
    expect(payload.ValDtls.IgstVal).toBe(1800);
  });
});

describe("buildIrpPayload — mixed GST rates across line items", () => {
  it("computes each item's own tax independently, and ItemList order matches lineItems order", () => {
    const payload = buildIrpPayload(
      makeDocument({
        lineItems: [
          {
            name: "18% item",
            description: "",
            qty: 1,
            rate: 1000,
            gstRate: 18,
            amount: 1000,
            foreignCurrency: null,
            foreignRate: null,
            exchangeRate: null,
            customFieldValues: [],
          },
          {
            name: "5% item",
            description: "",
            qty: 1,
            rate: 1000,
            gstRate: 5,
            amount: 1000,
            foreignCurrency: null,
            foreignRate: null,
            exchangeRate: null,
            customFieldValues: [],
          },
          {
            name: "0% item",
            description: "",
            qty: 1,
            rate: 1000,
            gstRate: 0,
            amount: 1000,
            foreignCurrency: null,
            foreignRate: null,
            exchangeRate: null,
            customFieldValues: [],
          },
        ],
      }),
    );

    expect(payload.ItemList.map((i) => i.PrdDesc)).toEqual([
      "18% item",
      "5% item",
      "0% item",
    ]);
    expect(payload.ItemList[0].GstRt).toBe(18);
    expect(payload.ItemList[0].CgstAmt).toBe(90);
    expect(payload.ItemList[0].SgstAmt).toBe(90);
    expect(payload.ItemList[1].GstRt).toBe(5);
    expect(payload.ItemList[1].CgstAmt).toBe(25);
    expect(payload.ItemList[1].SgstAmt).toBe(25);
    expect(payload.ItemList[2].GstRt).toBe(0);
    expect(payload.ItemList[2].CgstAmt).toBe(0);
    expect(payload.ItemList[2].SgstAmt).toBe(0);
  });
});

describe("buildIrpPayload — USD export invoice", () => {
  it("sets SupTyp to EXPWOP (export without payment of tax) for a non-INR document", () => {
    const payload = buildIrpPayload(
      makeDocument({
        currency: "USD",
        totals: {
          subtotal: 1000,
          discountTotal: 0,
          taxableAmount: 1000,
          cgst: 0,
          sgst: 0,
          igst: 0,
          total: 1000,
        },
        lineItems: [
          {
            name: "Export service",
            description: "",
            qty: 1,
            rate: 1000,
            gstRate: 0,
            amount: 1000,
            foreignCurrency: null,
            foreignRate: null,
            exchangeRate: null,
            customFieldValues: [],
          },
        ],
      }),
    );
    expect(payload.TranDtls.SupTyp).toBe("EXPWOP");
    expect(payload.ItemList[0].GstRt).toBe(0);
    expect(payload.ValDtls.TotInvVal).toBe(1000);
  });

  it("stays B2B for an INR document even with a foreign buyer", () => {
    const payload = buildIrpPayload(makeDocument({ currency: "INR" }));
    expect(payload.TranDtls.SupTyp).toBe("B2B");
  });
});

describe("buildIrpPayload — missing optional fields", () => {
  it("falls back to empty strings, not thrown errors, when GSTIN/address/HSN are absent", () => {
    const payload = buildIrpPayload(
      makeDocument({
        business: { ...business, gstin: null, address: null, city: null },
        customer: { ...sameStateCustomer, gstin: null, address: null, city: null, phone: null },
      }),
    );
    expect(payload.SellerDtls.Gstin).toBe("");
    expect(payload.SellerDtls.Addr1).toBe("");
    expect(payload.BuyerDtls.Gstin).toBe("");
    expect(payload.BuyerDtls.Ph).toBe("");
    // No dedicated HSN/SAC column anywhere in this app yet — see
    // lookupHsnCode's own comment — so a line item with no matching
    // custom field must produce an empty string, not throw.
    expect(payload.ItemList[0].HsnCd).toBe("");
  });

  it("picks up an HSN/SAC custom field by label when one is present", () => {
    const payload = buildIrpPayload(
      makeDocument({
        lineItems: [
          {
            name: "Ocean freight",
            description: "",
            qty: 1,
            rate: 10000,
            gstRate: 18,
            amount: 10000,
            foreignCurrency: null,
            foreignRate: null,
            exchangeRate: null,
            customFieldValues: [
              {
                definitionId: "cf1",
                label: "SAC Code",
                type: "text",
                value: "996511",
                sortOrder: 0,
              },
            ],
          },
        ],
      }),
    );
    expect(payload.ItemList[0].HsnCd).toBe("996511");
  });

  it("falls back to the Other Territory code for a customer with no recognised Indian state", () => {
    const payload = buildIrpPayload(
      makeDocument({ customer: { ...sameStateCustomer, state: null } }),
    );
    expect(payload.BuyerDtls.Stcd).toBe("97");
    expect(payload.BuyerDtls.Pos).toBe("97");
  });
});
