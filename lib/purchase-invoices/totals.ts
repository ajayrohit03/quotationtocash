import { Prisma } from "@prisma/client";
import { calculateGST } from "@/lib/tax/calculateGST";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

export type PurchaseLineTotalsInput = {
  qty: Decimal | number | string;
  rate: Decimal | number | string;
  gstRate: Decimal | number | string | null;
};

export type PurchaseLineTotals = {
  amount: Decimal;
  taxableAmount: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  igst: Decimal;
};

// A purchase line's own totals — qty * rate is the taxable base
// directly (no per-line discount %, unlike sales LineItem/
// calculateLineAmount — a vendor's invoice line is what it is). CESS is
// deliberately not computed here: always 0 for freight/logistics in
// practice, entered as 0 by the builder rather than derived — see
// docs/accounts-payable-phase1-design.md §1.3's own comment.
export function calculatePurchaseLineTotals(
  item: PurchaseLineTotalsInput,
  options: { gstEnabled: boolean; sameState: boolean },
): PurchaseLineTotals {
  const amount = new Decimal(item.qty).mul(item.rate).toDecimalPlaces(2);

  if (!options.gstEnabled) {
    return { amount, taxableAmount: amount, cgst: new Decimal(0), sgst: new Decimal(0), igst: new Decimal(0) };
  }

  const breakdown = calculateGST(amount, item.gstRate, options.sameState);
  return {
    amount,
    taxableAmount: amount,
    cgst: breakdown.cgst,
    sgst: breakdown.sgst,
    igst: breakdown.igst,
  };
}

export type PurchaseInvoiceTotals = {
  subtotal: Decimal;
  taxableAmount: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  igst: Decimal;
  total: Decimal;
};

// Sums calculatePurchaseLineTotals across every line — the invoice-level
// counterpart, same relationship calculateDocumentTotals has to
// calculateLineAmount on the sales side. cess is always 0 for Phase 1's
// own entry form (design doc §1.2) so it's added to `total` as a
// constant zero here rather than summed from anywhere.
export function calculatePurchaseInvoiceTotals(
  items: PurchaseLineTotalsInput[],
  options: { gstEnabled: boolean; sameState: boolean },
): PurchaseInvoiceTotals {
  let subtotal = new Decimal(0);
  let cgst = new Decimal(0);
  let sgst = new Decimal(0);
  let igst = new Decimal(0);

  for (const item of items) {
    const lineTotals = calculatePurchaseLineTotals(item, options);
    subtotal = subtotal.plus(lineTotals.amount);
    cgst = cgst.plus(lineTotals.cgst);
    sgst = sgst.plus(lineTotals.sgst);
    igst = igst.plus(lineTotals.igst);
  }

  const total = subtotal.plus(cgst).plus(sgst).plus(igst);

  return { subtotal, taxableAmount: subtotal, cgst, sgst, igst, total };
}
