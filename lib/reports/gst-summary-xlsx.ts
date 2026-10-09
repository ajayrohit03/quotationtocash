import "server-only";

import ExcelJS from "exceljs";
import { REPORT_COLUMNS, totalsByCurrency, type GstSummaryRow } from "./gst-summary";

const MONEY_FORMAT = "#,##0.00";

function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// One sheet: bold frozen header row, one row per invoice, then one totals
// row per currency (live SUMIF formulas over the data rows, with the
// computed value cached so viewers that don't recalculate still show it).
export async function buildGstSummaryWorkbook(rows: readonly GstSummaryRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QuotationToCash";
  const sheet = workbook.addWorksheet("GST Invoice Summary", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = REPORT_COLUMNS.map((c) => ({
    header: c.label,
    key: c.key,
    width: c.key === "customerName" ? 30 : c.key === "placeOfSupply" || c.key === "sacCodes" ? 18 : c.kind === "money" ? 15 : 13,
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EBF2" } };

  for (const row of rows) {
    // Strings are stored as strings, so a customer name beginning "=" is
    // never evaluated as a formula.
    const added = sheet.addRow(
      REPORT_COLUMNS.map((c) => {
        const value = row[c.key];
        return value === null ? null : value;
      }),
    );
    REPORT_COLUMNS.forEach((c, i) => {
      const cell = added.getCell(i + 1);
      if (c.kind === "money") cell.numFmt = MONEY_FORMAT;
      if (c.kind === "rate") cell.alignment = { horizontal: "right" };
    });
  }

  const firstData = 2;
  const lastData = rows.length + 1;
  const currencyCol = columnLetter(REPORT_COLUMNS.findIndex((c) => c.key === "currency"));
  const sumKeys = ["taxableValue", "cgstAmount", "sgstAmount", "igstAmount", "totalTax", "invoiceTotal"] as const;

  const totals = totalsByCurrency(rows);
  if (rows.length > 0) sheet.addRow([]);
  for (const t of totals) {
    const totalRow = sheet.addRow([]);
    const labelCell = totalRow.getCell(1);
    labelCell.value = `Total (${t.currency}) — ${t.count} document${t.count === 1 ? "" : "s"}`;
    totalRow.getCell(REPORT_COLUMNS.findIndex((c) => c.key === "currency") + 1).value = t.currency;
    for (const key of sumKeys) {
      const idx = REPORT_COLUMNS.findIndex((c) => c.key === key);
      const letter = columnLetter(idx);
      const cell = totalRow.getCell(idx + 1);
      // exceljs drops a cached result of 0, which a non-recalculating
      // viewer would show as blank — so a zero total is a plain 0.
      cell.value =
        t[key] === 0
          ? 0
          : {
              formula: `SUMIF($${currencyCol}$${firstData}:$${currencyCol}$${lastData},"${t.currency}",${letter}${firstData}:${letter}${lastData})`,
              result: t[key],
            };
      cell.numFmt = MONEY_FORMAT;
    }
    totalRow.font = { bold: true };
    totalRow.border = { top: { style: "thin" } };
  }

  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: lastData, column: REPORT_COLUMNS.length },
    };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
