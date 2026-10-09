// Pure logic for the GST Invoice Summary report — no Prisma, no server-only,
// so the preview page, the API route and the tests all share it.

export const REPORT_DOCUMENT_TYPES = ["invoice", "quotation", "proforma"] as const;
export type ReportDocumentType = (typeof REPORT_DOCUMENT_TYPES)[number];

// The UI's status checkboxes are groups over Document.status values (see
// lib/documents/status.ts). "cancelled" is deliberately in no group — it is
// always excluded. "overdue" is derived, never stored, so it isn't listed.
export const STATUS_GROUPS = {
  draft: ["draft"],
  sent: ["sent", "viewed", "accepted", "declined", "expired", "converted"],
  finalized: ["finalized"],
  paid: ["paid", "partially_paid"],
} as const;
export type StatusGroup = keyof typeof STATUS_GROUPS;
export const STATUS_GROUP_KEYS = Object.keys(STATUS_GROUPS) as StatusGroup[];

export const DEFAULT_STATUS_GROUPS: StatusGroup[] = ["sent", "finalized", "paid"];
export const DEFAULT_TYPES: ReportDocumentType[] = ["invoice"];

export function statusesForGroups(groups: readonly StatusGroup[]): string[] {
  return [...new Set(groups.flatMap((g) => STATUS_GROUPS[g]))];
}

export type GstSummaryRow = {
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD, IST calendar day
  invoiceType: ReportDocumentType;
  customerName: string;
  customerGstin: string;
  placeOfSupply: string;
  taxableValue: number;
  // number when every taxed line shares one rate, "9 / 6" when the invoice
  // mixes rates, null when that tax doesn't apply to the invoice at all.
  cgstRate: number | string | null;
  cgstAmount: number;
  sgstRate: number | string | null;
  sgstAmount: number;
  igstRate: number | string | null;
  igstAmount: number;
  totalTax: number;
  invoiceTotal: number;
  currency: string;
  status: string;
};

export type GstSummarySource = {
  number: string;
  type: ReportDocumentType;
  issueDate: Date;
  status: string;
  currency: string;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  customerSnapshot: { name?: string | null; company?: string | null; state?: string | null; gstin?: string | null };
  businessSnapshot: { placeOfSupply?: string | null };
  lineItems: { gstRate: number | null }[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const IST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function istDateString(date: Date): string {
  return IST_DATE.format(date);
}

function formatRates(rates: number[]): number | string | null {
  if (rates.length === 0) return null;
  if (rates.length === 1) return rates[0]!;
  return rates.join(" / ");
}

// Document stores cgst/sgst/igst as AMOUNTS only. Rates are re-derived from
// the already-frozen line items: intra-state splits each line rate in half
// between CGST and SGST; inter-state charges the full rate as IGST. A tax
// that has no amount on the invoice gets a null rate.
export function buildGstSummaryRow(doc: GstSummarySource): GstSummaryRow {
  const lineRates = [
    ...new Set(doc.lineItems.map((l) => l.gstRate).filter((r): r is number => !!r)),
  ].sort((a, b) => a - b);
  const halfRates = lineRates.map((r) => r / 2);

  const cgstAmount = round2(doc.cgst);
  const sgstAmount = round2(doc.sgst);
  const igstAmount = round2(doc.igst);

  return {
    invoiceNumber: doc.number,
    invoiceDate: istDateString(doc.issueDate),
    invoiceType: doc.type,
    customerName: doc.customerSnapshot.company?.trim() || doc.customerSnapshot.name?.trim() || "",
    customerGstin: doc.customerSnapshot.gstin?.trim() ?? "",
    // The recipient's state is the GST place of supply; a customer with no
    // state is treated as same-state by the app (isSameState), so fall back
    // to the business's own.
    placeOfSupply:
      doc.customerSnapshot.state?.trim() || doc.businessSnapshot.placeOfSupply?.trim() || "",
    taxableValue: round2(doc.taxableAmount),
    cgstRate: cgstAmount > 0 ? formatRates(halfRates) : null,
    cgstAmount,
    sgstRate: sgstAmount > 0 ? formatRates(halfRates) : null,
    sgstAmount,
    igstRate: igstAmount > 0 ? formatRates(lineRates) : null,
    igstAmount,
    totalTax: round2(cgstAmount + sgstAmount + igstAmount),
    invoiceTotal: round2(doc.total),
    currency: doc.currency,
    status: doc.status,
  };
}

export type CurrencyTotals = {
  currency: string;
  count: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  invoiceTotal: number;
};

// Totals are per currency — adding an INR amount to a USD one is meaningless.
// INR first, then the rest alphabetically.
export function totalsByCurrency(rows: readonly GstSummaryRow[]): CurrencyTotals[] {
  const map = new Map<string, CurrencyTotals>();
  for (const r of rows) {
    const t =
      map.get(r.currency) ??
      { currency: r.currency, count: 0, taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, invoiceTotal: 0 };
    t.count += 1;
    t.taxableValue += r.taxableValue;
    t.cgstAmount += r.cgstAmount;
    t.sgstAmount += r.sgstAmount;
    t.igstAmount += r.igstAmount;
    t.totalTax += r.totalTax;
    t.invoiceTotal += r.invoiceTotal;
    map.set(r.currency, t);
  }
  return [...map.values()]
    .map((t) => ({
      ...t,
      taxableValue: round2(t.taxableValue),
      cgstAmount: round2(t.cgstAmount),
      sgstAmount: round2(t.sgstAmount),
      igstAmount: round2(t.igstAmount),
      totalTax: round2(t.totalTax),
      invoiceTotal: round2(t.invoiceTotal),
    }))
    .sort((a, b) =>
      a.currency === "INR" ? -1 : b.currency === "INR" ? 1 : a.currency.localeCompare(b.currency),
    );
}

export type ReportColumn = {
  key: keyof GstSummaryRow;
  label: string;
  kind: "text" | "money" | "rate";
};

// Same columns in the preview table, the Excel file and the CSV. Type and
// Currency are additions to the requested list: the report can include
// quotations/proformas, and exports can be in a foreign currency.
export const REPORT_COLUMNS: readonly ReportColumn[] = [
  { key: "invoiceNumber", label: "Invoice No", kind: "text" },
  { key: "invoiceType", label: "Type", kind: "text" },
  { key: "invoiceDate", label: "Date", kind: "text" },
  { key: "customerName", label: "Customer", kind: "text" },
  { key: "customerGstin", label: "GSTIN", kind: "text" },
  { key: "placeOfSupply", label: "Place of Supply", kind: "text" },
  { key: "currency", label: "Currency", kind: "text" },
  { key: "taxableValue", label: "Taxable Value", kind: "money" },
  { key: "cgstRate", label: "CGST %", kind: "rate" },
  { key: "cgstAmount", label: "CGST Amt", kind: "money" },
  { key: "sgstRate", label: "SGST %", kind: "rate" },
  { key: "sgstAmount", label: "SGST Amt", kind: "money" },
  { key: "igstRate", label: "IGST %", kind: "rate" },
  { key: "igstAmount", label: "IGST Amt", kind: "money" },
  { key: "totalTax", label: "Total Tax", kind: "money" },
  { key: "invoiceTotal", label: "Invoice Total", kind: "money" },
  { key: "status", label: "Status", kind: "text" },
];

// A cell that a spreadsheet would read as a formula ("=", "+", "-", "@",
// tab, CR) gets a leading apostrophe — customer names are user input.
function csvText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = typeof value === "number" ? String(value) : csvText(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// UTF-8 BOM so Excel opens non-ASCII customer names correctly. Data rows
// only — no totals row, so the file can be fed straight into other tools.
export function buildCsv(rows: readonly GstSummaryRow[]): string {
  const lines = [
    REPORT_COLUMNS.map((c) => csvCell(c.label)).join(","),
    ...rows.map((row) =>
      REPORT_COLUMNS.map((c) => csvCell(row[c.key] as string | number | null)).join(","),
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function reportFilename(from: string, to: string, ext: "xlsx" | "csv"): string {
  return `GST-Report-${from}-to-${to}.${ext}`;
}
