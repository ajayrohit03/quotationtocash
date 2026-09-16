import { calculateGST } from "@/lib/tax/calculateGST";

export type TaxRateBucket = {
  rate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
};

// Display-only re-presentation of already-frozen line data — see
// docs/custom-fields-and-multicurrency-design.md §5. The grand total
// (Document.cgst/sgst/igst) stays the single accounting source of
// truth; this just groups the same already-saved line item
// amounts/rates by rate and re-applies the existing calculateGST per
// bucket, the same way per-line GST% is already re-derived for display
// without recomputing anything against live data. No new persisted
// column — cheap enough to recompute wherever it's shown.
//
// Operates on plain numbers (PreviewLineItem's already-frozen
// `amount`/`gstRate`), not Decimal directly, so this stays safe to
// import from document-render.tsx (a Client Component tree) — same
// reasoning as calculateGST.ts itself only ever touching `Prisma.Decimal`
// internally, never the full Prisma Client.
export function groupTaxByRate(
  lineItems: { amount: number; gstRate: number | null }[],
  sameState: boolean,
): TaxRateBucket[] {
  const taxableByRate = new Map<number, number>();

  for (const item of lineItems) {
    // Null or 0% — no tax row for this line, same as calculateGST's own
    // early-return for a zero rate.
    if (!item.gstRate) continue;
    taxableByRate.set(
      item.gstRate,
      (taxableByRate.get(item.gstRate) ?? 0) + item.amount,
    );
  }

  return [...taxableByRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, taxableAmount]) => {
      const breakdown = calculateGST(taxableAmount, rate, sameState);
      return {
        rate,
        taxableAmount,
        cgst: Number(breakdown.cgst),
        sgst: Number(breakdown.sgst),
        igst: Number(breakdown.igst),
      };
    });
}
