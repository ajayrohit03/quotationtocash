import { Prisma } from "@prisma/client";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

export type GstBreakdown = {
  cgst: Decimal;
  sgst: Decimal;
  igst: Decimal;
};

// Same state -> CGST + SGST, each half the rate. Different state -> IGST,
// full rate. See spec section 5 / build-prompt "GST" section — this is
// the ₹10,000 @ 18% example verbatim (same state: 900+900; inter-state:
// 1800), and lib/tax/__tests__/calculateGST.test.ts checks it exactly.
export function calculateGST(
  taxableAmount: Decimal | number | string,
  gstRate: Decimal | number | string | null | undefined,
  sameState: boolean,
): GstBreakdown {
  const zero = new Decimal(0);
  if (gstRate == null) {
    return { cgst: zero, sgst: zero, igst: zero };
  }

  const amount = new Decimal(taxableAmount);
  const rate = new Decimal(gstRate);

  if (amount.isZero() || rate.isZero()) {
    return { cgst: zero, sgst: zero, igst: zero };
  }

  if (sameState) {
    const half = amount.mul(rate.div(2)).div(100).toDecimalPlaces(2);
    return { cgst: half, sgst: half, igst: zero };
  }

  const igst = amount.mul(rate).div(100).toDecimalPlaces(2);
  return { cgst: zero, sgst: zero, igst };
}

// Whether Business.placeOfSupply and Customer.state fall in the same
// state — determines CGST+SGST vs IGST for the whole document (GST law
// applies this per place-of-supply/recipient-state comparison, not
// per line item, so this is computed once per document, not per line).
//
// Neither field being set is treated as same-state: it's the more common
// case for a business's local customers, and the alternative (defaulting
// to inter-state IGST) would silently misclassify the majority case. The
// document builder (Phase 6) makes customer.state effectively required
// once GST is enabled, so this fallback should rarely be exercised.
export function isSameState(
  businessPlaceOfSupply: string | null | undefined,
  customerState: string | null | undefined,
): boolean {
  if (!businessPlaceOfSupply || !customerState) return true;
  return (
    businessPlaceOfSupply.trim().toLowerCase() ===
    customerState.trim().toLowerCase()
  );
}
