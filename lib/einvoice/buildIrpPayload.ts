// ============================================================================
// SCAFFOLDING ONLY — no IRP API call exists anywhere in this app yet.
// This is a pure JSON transformation (Document -> IRP's INV-01 schema),
// built ahead of the real e-invoice1.gst.gov.in integration so that
// integration session has a tested, structurally-correct payload to
// start from rather than building the schema from scratch under time
// pressure. See docs on Document.einvoiceStatus and the "Generate IRN"
// button in document-preview.tsx (currently a placeholder toast) for
// the rest of the scaffolding this pairs with.
//
// Deliberately does NOT invent data the document doesn't have (HSN
// codes, PIN codes — see the TODOs below): IRP would reject a payload
// with fabricated values far more confusingly than one with an empty
// string in a field this app genuinely has no source for yet.
// ============================================================================

import type { PreviewDocument } from "@/components/documents/preview-types";

// Official 2-digit GST state/UT codes (CBIC), keyed by the exact state
// names this app already stores (see lib/constants/indian-states.ts —
// not imported from there directly since this map's only consumer is
// IRP formatting, not the rest of the app's own state handling).
const GST_STATE_CODES: Record<string, string> = {
  "Jammu and Kashmir": "01",
  "Himachal Pradesh": "02",
  Punjab: "03",
  Chandigarh: "04",
  Uttarakhand: "05",
  Haryana: "06",
  Delhi: "07",
  Rajasthan: "08",
  "Uttar Pradesh": "09",
  Bihar: "10",
  Sikkim: "11",
  "Arunachal Pradesh": "12",
  Nagaland: "13",
  Manipur: "14",
  Mizoram: "15",
  Tripura: "16",
  Meghalaya: "17",
  Assam: "18",
  "West Bengal": "19",
  Jharkhand: "20",
  Odisha: "21",
  Chhattisgarh: "22",
  "Madhya Pradesh": "23",
  Gujarat: "24",
  "Dadra and Nagar Haveli and Daman and Diu": "26",
  Maharashtra: "27",
  Karnataka: "29",
  Goa: "30",
  Lakshadweep: "31",
  Kerala: "32",
  "Tamil Nadu": "33",
  Puducherry: "34",
  "Andaman and Nicobar Islands": "35",
  Telangana: "36",
  "Andhra Pradesh": "37",
  Ladakh: "38",
};

// IRP's fallback for "not a recognised Indian state" (e.g. an export
// buyer with no Indian state at all) — "97" is the real IRP/GSTN code
// for Other Territory, used here as the least-wrong default rather than
// leaving the field empty (IRP requires Pos/Stcd to be present).
const UNKNOWN_STATE_CODE = "97";

function stateCode(state: string | null): string {
  if (!state) return UNKNOWN_STATE_CODE;
  return GST_STATE_CODES[state] ?? UNKNOWN_STATE_CODE;
}

// IRP wants DD/MM/YYYY, always in IST — same reasoning as
// lib/dates.ts's own formatDateIST, reimplemented narrowly here rather
// than imported since the output format (DD/MM/YYYY, no separators
// beyond "/") is IRP's own convention, not this app's display one.
function irpDate(isoDate: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date(isoDate));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// A line item's HSN/SAC code has no dedicated column anywhere in this
// app (see schema.prisma's LineItem model) — freight/logistics
// customers have been entering it as a custom field labeled "SAC Code"
// or "HSN Code" (see this session's freight examples), so this is a
// best-effort lookup, not a real data source. TODO(irp-integration):
// add a dedicated LineItem.hsnCode column once the real IRP call needs
// this to be reliable rather than best-effort — IRP will reject a
// payload with a blank HsnCd.
function lookupHsnCode(item: PreviewDocument["lineItems"][number]): string {
  const match = item.customFieldValues.find((v) => /hsn|sac/i.test(v.label));
  return match ? String(match.value) : "";
}

export type IrpPayload = {
  Version: "1.1";
  TranDtls: {
    TaxSch: "GST";
    // "EXPWP"/"EXPWOP" (export with/without payment of tax) when the
    // document's own currency isn't INR — matches this app's existing
    // "non-INR currency = zero-rated export under LUT" rule (see
    // docs/foreign-currency-invoicing-design.md); "B2B" otherwise, the
    // only other category this app's data can currently support (no B2C/
    // SEZ/deemed-export distinction exists in the document model yet).
    SupTyp: "B2B" | "EXPWOP";
    RegRev: "N";
    EcmGstin: null;
    IgstOnIntra: "N";
  };
  DocDtls: {
    Typ: "INV";
    No: string;
    Dt: string;
  };
  SellerDtls: {
    Gstin: string;
    LglNm: string;
    Addr1: string;
    Loc: string;
    // TODO(irp-integration): Business has no PIN code column yet — IRP
    // requires a real 6-digit PIN. Empty string until that field exists.
    Pin: string;
    Stcd: string;
    Ph: string;
    Em: string;
  };
  BuyerDtls: {
    Gstin: string;
    LglNm: string;
    Pos: string;
    Addr1: string;
    Loc: string;
    // TODO(irp-integration): same PIN gap as SellerDtls.Pin above —
    // Customer has no PIN code column either.
    Pin: string;
    Stcd: string;
    Ph: string;
    Em: string;
  };
  ItemList: Array<{
    SlNo: string;
    PrdDesc: string;
    IsServc: "Y" | "N";
    // TODO(irp-integration): no dedicated HSN/SAC column — see
    // lookupHsnCode's own comment.
    HsnCd: string;
    Qty: number;
    Unit: string;
    UnitPrice: number;
    TotAmt: number;
    Discount: number;
    AssAmt: number;
    GstRt: number;
    IgstAmt: number;
    CgstAmt: number;
    SgstAmt: number;
    TotItemVal: number;
  }>;
  ValDtls: {
    AssVal: number;
    CgstVal: number;
    SgstVal: number;
    IgstVal: number;
    TotInvVal: number;
  };
};

// The single, pure entry point — no network call, no side effect. Takes
// the same already-frozen PreviewDocument shape every other renderer in
// this app reads from (business/customer snapshots, already-Decimal-
// free line items and totals — see lib/documents/present.ts), so this
// never has to re-derive anything from a live row, or take a second
// "sameState" argument the caller would have to compute separately:
// the document's own frozen totals already say which applied (CGST+SGST
// nonzero means same-state, IGST nonzero means inter-state — see
// lib/tax/calculateGST.ts, which computes exactly one of the two per
// document, never both).
export function buildIrpPayload(document: PreviewDocument): IrpPayload {
  const { business, customer } = document;
  const isExport = document.currency !== "INR";
  const sameState = document.totals.igst === 0;

  const itemList = document.lineItems.map((item, index) => {
    const gstRate = item.gstRate ?? 0;
    const taxableValue = round2(item.amount);
    const igstAmt = sameState ? 0 : round2((taxableValue * gstRate) / 100);
    const cgstAmt = sameState ? round2((taxableValue * gstRate) / 200) : 0;
    const sgstAmt = sameState ? round2((taxableValue * gstRate) / 200) : 0;
    return {
      SlNo: String(index + 1),
      PrdDesc: item.name,
      // No product/service distinction anywhere in this app's data
      // model — every line item defaults to "goods" ("N") since that's
      // this app's more common case (freight/logistics line items are
      // themselves often billed as goods-adjacent charges); TODO(irp-
      // integration): add a real Product.isService flag if this needs
      // to be accurate rather than a default.
      IsServc: "N" as const,
      HsnCd: lookupHsnCode(item),
      Qty: item.qty,
      Unit: "NOS",
      UnitPrice: round2(item.rate),
      TotAmt: round2(item.qty * item.rate),
      Discount: round2(item.qty * item.rate - taxableValue),
      AssAmt: taxableValue,
      GstRt: gstRate,
      IgstAmt: igstAmt,
      CgstAmt: cgstAmt,
      SgstAmt: sgstAmt,
      TotItemVal: round2(taxableValue + igstAmt + cgstAmt + sgstAmt),
    };
  });

  return {
    Version: "1.1",
    TranDtls: {
      TaxSch: "GST",
      SupTyp: isExport ? "EXPWOP" : "B2B",
      RegRev: "N",
      EcmGstin: null,
      IgstOnIntra: "N",
    },
    DocDtls: {
      Typ: "INV",
      No: document.number,
      Dt: irpDate(document.issueDate),
    },
    SellerDtls: {
      Gstin: business.gstin ?? "",
      LglNm: business.name,
      Addr1: business.address ?? "",
      Loc: business.city ?? "",
      Pin: "",
      Stcd: stateCode(business.placeOfSupply ?? business.state),
      Ph: business.phone ?? "",
      Em: business.email,
    },
    BuyerDtls: {
      Gstin: customer.gstin ?? "",
      LglNm: customer.name,
      Pos: stateCode(customer.state),
      Addr1: customer.address ?? "",
      Loc: customer.city ?? "",
      Pin: "",
      Stcd: stateCode(customer.state),
      Ph: customer.phone ?? "",
      Em: customer.email ?? "",
    },
    ItemList: itemList,
    ValDtls: {
      AssVal: round2(document.totals.taxableAmount),
      CgstVal: round2(document.totals.cgst),
      SgstVal: round2(document.totals.sgst),
      IgstVal: round2(document.totals.igst),
      TotInvVal: round2(document.totals.total),
    },
  };
}
