import { Prisma } from "@prisma/client";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

// Money is always Decimal, never number/float — see AGENTS/spec rule
// "Do not use floating-point arithmetic for money."
export type LineItemAmountInput = {
  qty: Decimal | number | string;
  rate: Decimal | number | string;
  discountPct?: Decimal | number | string | null;
};

export type DocumentBaseTotals = {
  subtotal: Decimal;
  discountTotal: Decimal;
  taxableAmount: Decimal;
  total: Decimal;
};

// A line's billed amount: qty * rate, less its own discount %, rounded to
// the cent. This is what gets stored on LineItem.amount.
export function calculateLineAmount(item: LineItemAmountInput): Decimal {
  const qty = new Decimal(item.qty);
  const rate = new Decimal(item.rate);
  const discountPct = new Decimal(item.discountPct ?? 0);
  const gross = qty.mul(rate);
  const discountFactor = new Decimal(1).minus(discountPct.div(100));
  return gross.mul(discountFactor).toDecimalPlaces(2);
}

// Document-level subtotal/discount/taxable amount from a set of line
// items — no GST applied. lib/tax/calculateDocumentTotals (Phase 5) wraps
// this, adding CGST/SGST/IGST on top of taxableAmount to get the real
// `total`; until that's wired in, total === taxableAmount.
//
// Always recompute from the raw line item inputs (qty/rate/discountPct)
// rather than trusting stored/client-submitted totals — see spec rule
// "Recalculate totals server-side before persisting important document
// changes."
export function calculateBaseTotals(
  items: LineItemAmountInput[],
): DocumentBaseTotals {
  let subtotal = new Decimal(0);
  let discountTotal = new Decimal(0);

  for (const item of items) {
    const qty = new Decimal(item.qty);
    const rate = new Decimal(item.rate);
    const gross = qty.mul(rate).toDecimalPlaces(2);
    const lineAmount = calculateLineAmount(item);

    subtotal = subtotal.plus(gross);
    discountTotal = discountTotal.plus(gross.minus(lineAmount));
  }

  const taxableAmount = subtotal.minus(discountTotal);

  return {
    subtotal,
    discountTotal,
    taxableAmount,
    total: taxableAmount,
  };
}
