import { Prisma } from "@prisma/client";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

// Precedence per spec: a line item's own override, else its product's
// rate, else the business default. Resolved once at save time and stored
// on LineItem.gstRate — never re-resolved live at render/calculation
// time, so a later change to Business.gstDefaultRate (or the product's
// rate) can't retroactively alter a historical document's tax.
export function resolveGstRate(
  itemGstRate: Decimal | number | string | null | undefined,
  productGstRate: Decimal | number | string | null | undefined,
  businessDefaultRate: Decimal | number | string | null | undefined,
): Decimal | null {
  if (itemGstRate != null) return new Decimal(itemGstRate);
  if (productGstRate != null) return new Decimal(productGstRate);
  if (businessDefaultRate != null) return new Decimal(businessDefaultRate);
  return null;
}
