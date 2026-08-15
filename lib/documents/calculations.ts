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

// A line's billed amount: qty * rate, less its own discount %, rounded to
// the cent. This is what gets stored on LineItem.amount.
//
// The only other piece of a document's totals — subtotal/discount/
// taxable/CGST/SGST/IGST/total — lives in lib/tax/calculateDocumentTotals,
// which calls this for each line rather than duplicating the math (see
// spec rule "Do not duplicate document calculation logic").
export function calculateLineAmount(item: LineItemAmountInput): Decimal {
  const qty = new Decimal(item.qty);
  const rate = new Decimal(item.rate);
  const discountPct = new Decimal(item.discountPct ?? 0);
  const gross = qty.mul(rate);
  const discountFactor = new Decimal(1).minus(discountPct.div(100));
  return gross.mul(discountFactor).toDecimalPlaces(2);
}
