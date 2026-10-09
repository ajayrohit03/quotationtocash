import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db/prisma";

// Real DB, only the Clerk/Next request-context seam mocked (same pattern as
// app/api/jobs/__tests__/jobs.test.ts).
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ get: () => undefined }) }));

const businessIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  if (businessIds.length) {
    await prisma.document.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    businessIds.length = 0;
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    userIds.length = 0;
  }
  vi.resetModules();
});

async function createUser(name: string) {
  const user = await prisma.user.create({
    data: { email: `gst-${randomUUID()}@example.invalid`, authProviderId: `user_gst_${randomUUID()}`, name },
  });
  userIds.push(user.id);
  return user;
}

async function mockedAuthAs(clerkUserId: string | null) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as never);
}

async function setup() {
  const business = await prisma.business.create({
    data: {
      name: `GST Co ${randomUUID()}`,
      slug: `gst-${randomUUID()}`,
      email: `gst-biz-${randomUUID()}@example.invalid`,
      gstEnabled: true,
      placeOfSupply: "Karnataka",
    },
  });
  businessIds.push(business.id);
  const owner = await createUser("Owner");
  await prisma.businessMember.create({ data: { businessId: business.id, userId: owner.id, role: "owner" } });
  const staff = await createUser("Staff");
  await prisma.businessMember.create({ data: { businessId: business.id, userId: staff.id, role: "staff" } });
  const customer = await prisma.customer.create({ data: { businessId: business.id, name: "Cust" } });

  async function makeDoc(opts: {
    type?: "invoice" | "quotation" | "proforma";
    status?: string;
    issueDate?: string;
    number?: string;
    createdBy?: string;
    currency?: string;
    taxable?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    total?: number;
    rates?: number[];
    sacs?: (string | null)[];
    legacyCustomSac?: string;
    customerName?: string;
  } = {}) {
    return prisma.document.create({
      data: {
        businessId: business.id,
        type: opts.type ?? "invoice",
        number: opts.number ?? `GST-${randomUUID().slice(0, 8)}`,
        customerId: customer.id,
        issueDate: new Date(`${opts.issueDate ?? "2026-09-15"}T00:00:00Z`),
        createdByUserId: opts.createdBy ?? owner.id,
        status: opts.status ?? "sent",
        currency: opts.currency ?? "INR",
        taxableAmount: opts.taxable ?? 10000,
        cgst: opts.cgst ?? 900,
        sgst: opts.sgst ?? 900,
        igst: opts.igst ?? 0,
        total: opts.total ?? 11800,
        customerSnapshot: { name: opts.customerName ?? "Buyer", company: null, state: "Karnataka", gstin: "29AABCA1234A1Z5" },
        businessSnapshot: { placeOfSupply: "Karnataka" },
        lineItems: {
          create: (opts.rates ?? [18]).map((r, i) => ({
            name: `Item ${i}`,
            qty: 1,
            rate: 100,
            amount: 100,
            gstRate: r,
            sortOrder: i,
            sac: opts.sacs?.[i] ?? null,
            customFieldValues:
              opts.legacyCustomSac && i === 0
                ? [{ definitionId: "d1", label: "SAC Code", type: "text", value: opts.legacyCustomSac, sortOrder: 0 }]
                : [],
          })),
        },
      },
    });
  }

  return { business, owner, staff, makeDoc };
}

async function call(query: string) {
  const { GET } = await import("@/app/api/reports/gst-summary/route");
  return GET(new NextRequest(`http://localhost/api/reports/gst-summary?${query}`));
}

const RANGE = "from=2026-09-01&to=2026-09-30";

describe("GET /api/reports/gst-summary — filtering", () => {
  it("requires authentication", async () => {
    await mockedAuthAs(null);
    expect((await call(RANGE)).status).toBe(401);
  });

  it("returns a plain JSON array of rows with the documented fields", async () => {
    const { owner, makeDoc } = await setup();
    await mockedAuthAs(owner.authProviderId);
    await makeDoc({ number: "INV-1" });
    const res = await call(RANGE);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(Object.keys(body[0]).sort()).toEqual(
      [
        "invoiceNumber", "invoiceDate", "invoiceType", "sacCodes", "customerName", "customerGstin", "placeOfSupply",
        "taxableValue", "cgstRate", "cgstAmount", "sgstRate", "sgstAmount", "igstRate", "igstAmount",
        "totalTax", "invoiceTotal", "currency", "status",
      ].sort(),
    );
    expect(body[0]).toMatchObject({
      invoiceNumber: "INV-1",
      invoiceDate: "2026-09-15",
      invoiceType: "invoice",
      sacCodes: "",
      customerName: "Buyer",
      customerGstin: "29AABCA1234A1Z5",
      placeOfSupply: "Karnataka",
      taxableValue: 10000,
      cgstRate: 9,
      cgstAmount: 900,
      sgstRate: 9,
      igstRate: null,
      totalTax: 1800,
      invoiceTotal: 11800,
      currency: "INR",
      status: "sent",
    });
  });

  it("defaults: invoices only, no drafts, never cancelled", async () => {
    const { owner, makeDoc } = await setup();
    await mockedAuthAs(owner.authProviderId);
    await makeDoc({ number: "SENT", status: "sent" });
    await makeDoc({ number: "FIN", status: "finalized" });
    await makeDoc({ number: "PAID", status: "paid" });
    await makeDoc({ number: "PART", status: "partially_paid" });
    await makeDoc({ number: "DRAFT", status: "draft" });
    await makeDoc({ number: "CANC", status: "cancelled" });
    await makeDoc({ number: "QUOTE", type: "quotation", status: "sent" });
    await makeDoc({ number: "PRO", type: "proforma", status: "sent" });
    const numbers = (await (await call(RANGE)).json()).map((r: { invoiceNumber: string }) => r.invoiceNumber).sort();
    expect(numbers).toEqual(["FIN", "PAID", "PART", "SENT"]);
  });

  it("statuses and types params widen the selection, but cancelled is still excluded", async () => {
    const { owner, makeDoc } = await setup();
    await mockedAuthAs(owner.authProviderId);
    await makeDoc({ number: "DRAFT", status: "draft" });
    await makeDoc({ number: "CANC", status: "cancelled" });
    await makeDoc({ number: "QUOTE", type: "quotation", status: "sent" });
    await makeDoc({ number: "PRO", type: "proforma", status: "finalized" });
    const numbers = (
      await (await call(`${RANGE}&statuses=draft,sent,finalized,paid&types=invoice,quotation,proforma`)).json()
    )
      .map((r: { invoiceNumber: string }) => r.invoiceNumber)
      .sort();
    expect(numbers).toEqual(["DRAFT", "PRO", "QUOTE"]);
    expect((await call(`${RANGE}&statuses=cancelled`)).status).toBe(400);
  });

  it("date range is inclusive of both end dates", async () => {
    const { owner, makeDoc } = await setup();
    await mockedAuthAs(owner.authProviderId);
    await makeDoc({ number: "BEFORE", issueDate: "2026-08-31" });
    await makeDoc({ number: "FIRST", issueDate: "2026-09-01" });
    await makeDoc({ number: "LAST", issueDate: "2026-09-30" });
    await makeDoc({ number: "AFTER", issueDate: "2026-10-01" });
    const rows = await (await call(RANGE)).json();
    expect(rows.map((r: { invoiceNumber: string }) => r.invoiceNumber)).toEqual(["FIRST", "LAST"]);
  });

  it("only returns the current business's documents", async () => {
    const a = await setup();
    const b = await setup();
    await a.makeDoc({ number: "A-DOC" });
    await b.makeDoc({ number: "B-DOC" });
    await mockedAuthAs(a.owner.authProviderId);
    const rows = await (await call(RANGE)).json();
    expect(rows.map((r: { invoiceNumber: string }) => r.invoiceNumber)).toEqual(["A-DOC"]);
  });

  it("respects document visibility: staff see their own documents, not the owner's", async () => {
    const { owner, staff, makeDoc } = await setup();
    await makeDoc({ number: "OWNERS", createdBy: owner.id });
    await makeDoc({ number: "STAFFS", createdBy: staff.id });
    await mockedAuthAs(staff.authProviderId);
    const staffRows = await (await call(RANGE)).json();
    expect(staffRows.map((r: { invoiceNumber: string }) => r.invoiceNumber)).toEqual(["STAFFS"]);
    await mockedAuthAs(owner.authProviderId);
    const ownerRows = await (await call(RANGE)).json();
    expect(ownerRows).toHaveLength(2);
  });

  it("derives a mixed-rate invoice's rates and reports an export with no tax", async () => {
    const { owner, makeDoc } = await setup();
    await mockedAuthAs(owner.authProviderId);
    await makeDoc({ number: "MIX", rates: [18, 12], taxable: 20000, cgst: 1500, sgst: 1500, total: 23000 });
    await makeDoc({ number: "EXPORT", currency: "USD", taxable: 500, cgst: 0, sgst: 0, igst: 0, total: 500, rates: [0] });
    const rows = await (await call(RANGE)).json();
    const mix = rows.find((r: { invoiceNumber: string }) => r.invoiceNumber === "MIX");
    const exp = rows.find((r: { invoiceNumber: string }) => r.invoiceNumber === "EXPORT");
    expect(mix).toMatchObject({ cgstRate: "6 / 9", sgstRate: "6 / 9" });
    expect(exp).toMatchObject({ cgstRate: null, igstRate: null, totalTax: 0, currency: "USD" });
  });

  it("lists each invoice's unique SAC/HSN codes, including a legacy custom-field code", async () => {
    const { owner, makeDoc } = await setup();
    await mockedAuthAs(owner.authProviderId);
    await makeDoc({ number: "MULTI", rates: [18, 18, 12], sacs: ["996521", "996799", "996521"] });
    await makeDoc({ number: "LEGACY", rates: [18], legacyCustomSac: "996511" });
    await makeDoc({ number: "NONE", rates: [18] });
    const rows = await (await call(RANGE)).json();
    const byNo = Object.fromEntries(rows.map((r: { invoiceNumber: string; sacCodes: string }) => [r.invoiceNumber, r.sacCodes]));
    expect(byNo).toEqual({ MULTI: "996521, 996799", LEGACY: "996511", NONE: "" });
    expect(rows).toHaveLength(3); // still one row per invoice
  });

  it("puts the codes in the Excel SAC / HSN Code column (column 3) and keeps one row per invoice", async () => {
    const { owner, makeDoc } = await setup();
    await mockedAuthAs(owner.authProviderId);
    await makeDoc({ number: "X1", rates: [18, 12], sacs: ["996521", "996799"] });
    const res = await call(`${RANGE}&format=xlsx`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
    const sheet = wb.worksheets[0]!;
    expect(sheet.getRow(1).getCell(3).value).toBe("SAC / HSN Code");
    expect(sheet.getRow(2).getCell(1).value).toBe("X1");
    expect(sheet.getRow(2).getCell(3).value).toBe("996521, 996799");
  });

  it("validates the query", async () => {
    const { owner } = await setup();
    await mockedAuthAs(owner.authProviderId);
    for (const q of [
      "to=2026-09-30",
      "from=2026-09-01",
      "from=2026-9-1&to=2026-09-30",
      "from=2026-09-30&to=2026-09-01",
      "from=2020-01-01&to=2026-09-30",
      `${RANGE}&types=journal`,
      `${RANGE}&format=pdf`,
      "from=2026-13-45&to=2026-09-30",
    ]) {
      expect((await call(q)).status, q).toBe(400);
    }
  });
});

describe("GET /api/reports/gst-summary — file exports", () => {
  it("xlsx: right filename and headers, one row per invoice, per-currency SUMIF totals", async () => {
    const { owner, makeDoc } = await setup();
    await mockedAuthAs(owner.authProviderId);
    await makeDoc({ number: "R1", taxable: 10000, cgst: 900, sgst: 900, total: 11800 });
    await makeDoc({ number: "R2", taxable: 5000, cgst: 450, sgst: 450, total: 5900 });
    await makeDoc({ number: "USD1", currency: "USD", taxable: 500, cgst: 0, sgst: 0, total: 500, rates: [0] });

    const res = await call(`${RANGE}&format=xlsx`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="GST-Report-2026-09-01-to-2026-09-30.xlsx"');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
    const sheet = workbook.worksheets[0]!;
    const labels = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(labels).toEqual([
      "Invoice No", "Type", "SAC / HSN Code", "Date", "Customer", "GSTIN", "Place of Supply", "Currency", "Taxable Value",
      "CGST %", "CGST Amt", "SGST %", "SGST Amt", "IGST %", "IGST Amt", "Total Tax", "Invoice Total", "Status",
    ]);
    const invoiceNos = [2, 3, 4].map((r) => sheet.getRow(r).getCell(1).value);
    expect(invoiceNos.sort()).toEqual(["R1", "R2", "USD1"]);

    const totalRows: Record<string, ExcelJS.Row> = {};
    sheet.eachRow((row) => {
      const first = String(row.getCell(1).value ?? "");
      if (first.startsWith("Total (")) totalRows[first.slice(7, 10)] = row;
    });
    const inr = totalRows["INR"]!;
    const taxableCell = inr.getCell(9).value as { formula: string; result: number };
    expect(taxableCell.formula).toContain("SUMIF");
    expect(taxableCell.result).toBe(15000);
    expect((inr.getCell(16).value as { result: number }).result).toBe(2700); // Total Tax
    expect((inr.getCell(17).value as { result: number }).result).toBe(17700); // Invoice Total
    expect((totalRows["USD"]!.getCell(9).value as { result: number }).result).toBe(500);
  });

  it("csv: filename, BOM, header and a row per invoice with no totals line", async () => {
    const { owner, makeDoc } = await setup();
    await mockedAuthAs(owner.authProviderId);
    await makeDoc({ number: "C1" });
    await makeDoc({ number: "C2" });
    const res = await call(`${RANGE}&format=csv`);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="GST-Report-2026-09-01-to-2026-09-30.csv"');
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Response.text() strips a BOM when decoding, so check the raw bytes.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1);
    expect(text.startsWith("Invoice No,Type,SAC / HSN Code,Date,Customer,GSTIN,Place of Supply,Currency,Taxable Value,")).toBe(true);
    expect(text.trimEnd().split("\r\n")).toHaveLength(3);
  });

  it("an empty result still downloads a valid file with just the header", async () => {
    const { owner } = await setup();
    await mockedAuthAs(owner.authProviderId);
    const csv = await (await call(`${RANGE}&format=csv`)).text();
    expect(csv.trimEnd().split("\r\n")).toHaveLength(1);
    const xlsx = await call(`${RANGE}&format=xlsx`);
    expect(xlsx.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await xlsx.arrayBuffer()) as never);
    expect(wb.worksheets[0]!.rowCount).toBe(1);
  });
});
