import { Prisma } from "@prisma/client";
import { calculateLineAmount } from "@/lib/documents/calculations";
import { calculateGST } from "@/lib/tax/calculateGST";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

export type TaxableLineItemInput = {
  qty: Decimal | number | string;
  rate: Decimal | number | string;
  discountPct?: Decimal | number | string | null;
  // Already resolved via resolveGstRate — this module doesn't know about
  // products or business defaults, only the rate that actually applies.
  gstRate: Decimal | number | string | null;
};

export type DocumentTotals = {
  subtotal: Decimal;
  discountTotal: Decimal;
  taxableAmount: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  igst: Decimal;
  total: Decimal;
};

// The single source of truth for a document's totals — subtotal through
// grand total. Always recompute from the raw line item inputs server-side
// rather than trusting a client-submitted total (spec rule).
//
// When gstEnabled is false, no tax rows are computed at all (not even
// zeroed CGST/SGST for a 0%-rated item) — GST-disabled businesses see a
// plain total, full stop.
export function calculateDocumentTotals(
  items: TaxableLineItemInput[],
  options: { gstEnabled: boolean; sameState: boolean },
): DocumentTotals {
  let subtotal = new Decimal(0);
  let discountTotal = new Decimal(0);
  let cgst = new Decimal(0);
  let sgst = new Decimal(0);
  let igst = new Decimal(0);

  for (const item of items) {
    const gross = new Decimal(item.qty).mul(item.rate).toDecimalPlaces(2);
    const lineAmount = calculateLineAmount(item);
    subtotal = subtotal.plus(gross);
    discountTotal = discountTotal.plus(gross.minus(lineAmount));

    if (options.gstEnabled) {
      const breakdown = calculateGST(
        lineAmount,
        item.gstRate,
        options.sameState,
      );
      cgst = cgst.plus(breakdown.cgst);
      sgst = sgst.plus(breakdown.sgst);
      igst = igst.plus(breakdown.igst);
    }
  }

  const taxableAmount = subtotal.minus(discountTotal);
  const total = taxableAmount.plus(cgst).plus(sgst).plus(igst);

  return { subtotal, discountTotal, taxableAmount, cgst, sgst, igst, total };
}
