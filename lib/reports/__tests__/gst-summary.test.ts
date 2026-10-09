import { describe, expect, it } from "vitest";
import {
  REPORT_COLUMNS,
  buildCsv,
  buildGstSummaryRow,
  istDateString,
  reportFilename,
  statusesForGroups,
  totalsByCurrency,
  type GstSummarySource,
} from "../gst-summary";

function doc(overrides: Partial<GstSummarySource> = {}): GstSummarySource {
  return {
    number: "INV-2026-0001",
    type: "invoice",
    issueDate: new Date("2026-09-19T00:00:00Z"),
    status: "sent",
    currency: "INR",
    taxableAmount: 10000,
    cgst: 900,
    sgst: 900,
    igst: 0,
    total: 11800,
    customerSnapshot: { name: "Rahul", company: "Acme Pvt Ltd", state: "Karnataka", gstin: "29AABCA1234A1Z5" },
    businessSnapshot: { placeOfSupply: "Karnataka" },
    lineItems: [{ gstRate: 18 }],
    ...overrides,
  };
}

describe("buildGstSummaryRow — rates are derived from line items", () => {
  it("intra-state: CGST and SGST are each half the line rate, no IGST rate", () => {
    const row = buildGstSummaryRow(doc());
    expect(row).toMatchObject({
      taxableValue: 10000,
      cgstRate: 9,
      cgstAmount: 900,
      sgstRate: 9,
      sgstAmount: 900,
      igstRate: null,
      igstAmount: 0,
      totalTax: 1800,
      invoiceTotal: 11800,
    });
  });

  it("inter-state: IGST carries the full rate, CGST/SGST rates are null", () => {
    const row = buildGstSummaryRow(doc({ cgst: 0, sgst: 0, igst: 1800 }));
    expect(row).toMatchObject({ cgstRate: null, sgstRate: null, igstRate: 18, igstAmount: 1800, totalTax: 1800 });
  });

  it("a mixed-rate invoice lists the distinct rates ascending instead of guessing one", () => {
    const row = buildGstSummaryRow(
      doc({ taxableAmount: 20000, cgst: 1050, sgst: 1050, lineItems: [{ gstRate: 18 }, { gstRate: 12 }, { gstRate: 18 }] }),
    );
    expect(row.cgstRate).toBe("6 / 9");
    expect(row.sgstRate).toBe("6 / 9");
  });

  it("a zero-tax invoice (export under LUT, or 0% lines) has no rates", () => {
    const row = buildGstSummaryRow(doc({ cgst: 0, sgst: 0, igst: 0, lineItems: [{ gstRate: 0 }, { gstRate: null }], currency: "USD" }));
    expect(row).toMatchObject({ cgstRate: null, sgstRate: null, igstRate: null, totalTax: 0, currency: "USD" });
  });

  it("uses the company name when present, else the contact name; empty strings, never null", () => {
    expect(buildGstSummaryRow(doc()).customerName).toBe("Acme Pvt Ltd");
    const bare = buildGstSummaryRow(doc({ customerSnapshot: { name: "Rahul", company: null, state: null, gstin: null } }));
    expect(bare.customerName).toBe("Rahul");
    expect(bare.customerGstin).toBe("");
  });

  it("place of supply is the customer's state, falling back to the business's", () => {
    expect(buildGstSummaryRow(doc()).placeOfSupply).toBe("Karnataka");
    const noState = buildGstSummaryRow(
      doc({ customerSnapshot: { name: "X", state: null }, businessSnapshot: { placeOfSupply: "Tamil Nadu" } }),
    );
    expect(noState.placeOfSupply).toBe("Tamil Nadu");
  });

  it("dates are IST calendar days (a 20:00 UTC instant is already the next IST day)", () => {
    expect(istDateString(new Date("2026-09-19T00:00:00Z"))).toBe("2026-09-19");
    expect(istDateString(new Date("2026-09-19T20:00:00Z"))).toBe("2026-09-20");
  });
});

describe("buildGstSummaryRow — SAC / HSN codes", () => {
  const withLines = (lineItems: GstSummarySource["lineItems"]) => buildGstSummaryRow(doc({ lineItems }));

  it("joins the unique codes in line order, dropping duplicates", () => {
    const row = withLines([
      { gstRate: 18, sac: "996521" },
      { gstRate: 18, sac: "996799" },
      { gstRate: 18, sac: "996521" },
      { gstRate: 12, sac: "996712" },
    ]);
    expect(row.sacCodes).toBe("996521, 996799, 996712");
  });

  it("is an empty string when no line carries a code", () => {
    expect(withLines([{ gstRate: 18 }, { gstRate: 18, sac: null }, { gstRate: 18, sac: "  " }]).sacCodes).toBe("");
  });

  it("falls back to a legacy 'SAC Code' / 'HSN' custom field when the column is empty", () => {
    const row = withLines([
      { gstRate: 18, sac: null, customFieldValues: [{ label: "Vessel", value: "MSC" }, { label: "SAC Code", value: "996511" }] },
      { gstRate: 18, sac: "996521", customFieldValues: [{ label: "HSN Code", value: "000000" }] },
      { gstRate: 18, sac: "", customFieldValues: [{ label: "hsn", value: 9983 }] },
    ]);
    // The real column wins over the custom field on the same line.
    expect(row.sacCodes).toBe("996511, 996521, 9983");
  });

  it("ignores unrelated custom fields and null values", () => {
    expect(withLines([{ gstRate: 18, customFieldValues: [{ label: "Project", value: "X" }, { label: "SAC", value: null }] }]).sacCodes).toBe("");
  });

  it("appears right after Invoice No and Type in the column list, labelled 'SAC / HSN Code'", () => {
    expect(REPORT_COLUMNS.slice(0, 3).map((c) => c.label)).toEqual(["Invoice No", "Type", "SAC / HSN Code"]);
  });

  it("quotes a code list in CSV because it contains commas", () => {
    const csv = buildCsv([withLines([{ gstRate: 18, sac: "996521" }, { gstRate: 18, sac: "996799" }])]);
    expect(csv).toContain(',invoice,"996521, 996799",');
  });
});

describe("totalsByCurrency", () => {
  const row = (currency: string, taxable: number, tax: number) =>
    buildGstSummaryRow(doc({ currency, taxableAmount: taxable, cgst: tax / 2, sgst: tax / 2, total: taxable + tax }));

  it("never adds different currencies together, INR first", () => {
    const totals = totalsByCurrency([row("USD", 500, 0), row("INR", 10000, 1800), row("INR", 5000, 900)]);
    expect(totals.map((t) => t.currency)).toEqual(["INR", "USD"]);
    expect(totals[0]).toMatchObject({ count: 2, taxableValue: 15000, cgstAmount: 1350, sgstAmount: 1350, totalTax: 2700, invoiceTotal: 17700 });
    expect(totals[1]).toMatchObject({ count: 1, taxableValue: 500, totalTax: 0 });
  });

  it("rounds away floating-point drift", () => {
    const rows = Array.from({ length: 10 }, () => row("INR", 0.1, 0));
    expect(totalsByCurrency(rows)[0]!.taxableValue).toBe(1);
  });

  it("is empty for no rows", () => {
    expect(totalsByCurrency([])).toEqual([]);
  });
});

describe("statusesForGroups", () => {
  it("never includes cancelled, whatever is selected", () => {
    expect(statusesForGroups(["draft", "sent", "finalized", "paid"])).not.toContain("cancelled");
  });
  it("maps groups to the real status values", () => {
    expect(statusesForGroups(["paid"])).toEqual(["paid", "partially_paid"]);
    expect(statusesForGroups(["finalized"])).toEqual(["finalized"]);
    expect(statusesForGroups(["sent"])).toEqual(expect.arrayContaining(["sent", "viewed"]));
  });
  it("is empty for no groups", () => {
    expect(statusesForGroups([])).toEqual([]);
  });
});

describe("buildCsv", () => {
  it("starts with a UTF-8 BOM and the column labels, then one line per row, no totals", () => {
    const csv = buildCsv([buildGstSummaryRow(doc())]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(REPORT_COLUMNS.map((c) => c.label).join(","));
    expect(lines[1]).toContain("INV-2026-0001");
  });

  it("quotes commas/quotes/newlines and leaves numbers bare, null as empty", () => {
    const csv = buildCsv([
      buildGstSummaryRow(doc({ customerSnapshot: { name: 'Smith, "Bob"\nJr', company: null, state: "KA", gstin: null } })),
    ]);
    expect(csv).toContain('"Smith, ""Bob""\nJr"');
    expect(csv).toContain(",10000,9,900,9,900,,0,1800,11800,");
  });

  it("defuses spreadsheet formula injection in text cells", () => {
    const csv = buildCsv([
      buildGstSummaryRow(doc({ customerSnapshot: { name: "=HYPERLINK(\"http://x\")", company: null, state: "KA", gstin: "+1" } })),
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain(",'+1,");
  });
});

describe("reportFilename", () => {
  it("follows GST-Report-{from}-to-{to}.{ext}", () => {
    expect(reportFilename("2026-01-01", "2026-10-09", "xlsx")).toBe("GST-Report-2026-01-01-to-2026-10-09.xlsx");
    expect(reportFilename("2026-01-01", "2026-10-09", "csv")).toBe("GST-Report-2026-01-01-to-2026-10-09.csv");
  });
});
