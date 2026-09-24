import { Skeleton } from "@/components/ui/skeleton";

// A generic list-page loading placeholder — a search bar plus a handful
// of row-shaped bars. Used as the Suspense fallback on the main list
// pages (Invoices/Quotations/Proforma via DocumentListPage, Customers,
// Products) so navigation shows this instantly instead of a blank page
// while the server fetch runs. Purely cosmetic: it doesn't know the
// real column count or row content, just approximates the shape closely
// enough that the real table "pops in" without a jarring layout shift.
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-full max-w-sm" />
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex items-center gap-4 border-b border-border bg-muted/40 px-4 py-3">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="ml-auto h-3.5 w-16" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-16" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0"
          >
            <Skeleton className="h-4 w-32" />
            <Skeleton className="ml-auto h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
