import type { Prisma } from "@prisma/client";

type Decimal = Prisma.Decimal;

// Display-only: converts to number at the last possible step. All actual
// money math stays in Decimal (see lib/documents/calculations.ts) — this
// is purely for rendering a formatted string.
export function formatCurrency(
  amount: Decimal | number | string,
  currency = "INR",
): string {
  const value =
    typeof amount === "number" ? amount : Number(amount.toString());

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
