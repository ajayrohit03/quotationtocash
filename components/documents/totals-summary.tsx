import type { DocumentTotals } from "@/lib/tax/calculateDocumentTotals";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function TotalsSummary({
  totals,
  gstEnabled,
}: {
  totals: DocumentTotals;
  gstEnabled: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1.5">
        <Row label="Subtotal" value={formatCurrency(totals.subtotal)} />
        <Row
          label="Discount"
          value={`− ${formatCurrency(totals.discountTotal)}`}
          valueClassName="text-success"
        />
        {gstEnabled && (
          <>
            <Row
              label="Taxable amount"
              value={formatCurrency(totals.taxableAmount)}
            />
            {totals.cgst.greaterThan(0) && (
              <Row label="CGST" value={formatCurrency(totals.cgst)} />
            )}
            {totals.sgst.greaterThan(0) && (
              <Row label="SGST" value={formatCurrency(totals.sgst)} />
            )}
            {totals.igst.greaterThan(0) && (
              <Row label="IGST" value={formatCurrency(totals.igst)} />
            )}
          </>
        )}
        <div className="my-1.5 h-px bg-border" />
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-xl font-semibold tracking-tight">
            {formatCurrency(totals.total)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={valueClassName}>{value}</span>
    </div>
  );
}
