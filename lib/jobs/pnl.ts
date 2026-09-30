// Per-currency P&L grouping — see docs/job-pnl-phase2-design.md §9.
// Deliberately NOT a single blended number: a job's linked documents/
// purchase invoices can each be in their own settlement currency
// (Document.currency / PurchaseInvoice.currency, independently), and
// naively summing PurchaseInvoice.total in USD against Document.total
// in INR would add unlike units. This groups by currency instead —
// the common single-currency case renders as one row; a mixed-currency
// job renders one Billed/Cost/Margin row per currency present, with no
// attempt to convert or combine them.

export type JobPnlLineInput = {
  total: number;
  currency: string;
};

export type JobPnlCurrencyGroup = {
  currency: string;
  billed: number;
  cost: number;
  margin: number;
  marginPct: number | null;
};

// Billed: type "invoice" only, status !== "cancelled" (draft included —
// see design doc §7's own "draft invoices count" reasoning). Cost:
// every non-cancelled PurchaseInvoice — no type-filtering, there's no
// purchase-side quotation/proforma equivalent.
export function groupJobPnlByCurrency(
  billedLines: JobPnlLineInput[],
  costLines: JobPnlLineInput[],
): JobPnlCurrencyGroup[] {
  const byCurrency = new Map<string, { billed: number; cost: number }>();

  for (const line of billedLines) {
    const entry = byCurrency.get(line.currency) ?? { billed: 0, cost: 0 };
    entry.billed += line.total;
    byCurrency.set(line.currency, entry);
  }
  for (const line of costLines) {
    const entry = byCurrency.get(line.currency) ?? { billed: 0, cost: 0 };
    entry.cost += line.total;
    byCurrency.set(line.currency, entry);
  }

  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, { billed, cost }]) => {
      const margin = billed - cost;
      return {
        currency,
        billed,
        cost,
        margin,
        marginPct: billed > 0 ? (margin / billed) * 100 : null,
      };
    });
}
