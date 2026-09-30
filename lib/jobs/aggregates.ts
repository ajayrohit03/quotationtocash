import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { documentScopeWhere } from "@/lib/documents/visibility";
import { purchaseInvoiceScopeWhere } from "@/lib/purchase-invoices/visibility";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

export type JobPnlSummary = {
  salesInvoiceCount: number;
  totalBilled: Decimal;
  purchaseInvoiceCount: number;
  totalCost: Decimal;
};

// Batched (groupBy), same shape as lib/documents/aggregates.ts's
// getCustomersBillingSummaries — one query per side for every job at
// once, not one aggregate query per job. See
// docs/job-pnl-phase2-design.md §0/§7 for why these specific filters:
// - Billed: type "invoice" only (quotations/proforma are linkable but
//   aren't real billing), excluding status "cancelled". Draft
//   invoices ARE included, deliberately diverging from
//   getCustomersBillingSummaries' own INVOICED_STATUSES (§7's own
//   "draft invoices count" reasoning) — a job's own economics don't
//   wait for the invoice to be formally sent.
// - Cost: every PurchaseInvoice (no type-filtering — there's no
//   purchase-side quotation/proforma equivalent), excluding status
//   "cancelled".
// Multi-currency (§9): deliberately NOT handled here — this module
// sums `total` verbatim regardless of currency. Stage (a) only needs
// the per-job groupBy plumbing; the list/detail pages (§3/§4) are
// responsible for grouping by currency before display once Stage (b)
// renders these figures. See design doc §9's own note on why a naive
// cross-currency sum would be meaningless.
export async function getJobsPnlSummaries(
  businessId: string,
  jobIds: string[],
): Promise<Map<string, JobPnlSummary>> {
  const summaries = new Map<string, JobPnlSummary>(
    jobIds.map((id) => [
      id,
      {
        salesInvoiceCount: 0,
        totalBilled: new Decimal(0),
        purchaseInvoiceCount: 0,
        totalCost: new Decimal(0),
      },
    ]),
  );

  if (jobIds.length === 0) return summaries;

  const [documentVisibility, purchaseInvoiceVisibility] = await Promise.all([
    documentScopeWhere("view"),
    purchaseInvoiceScopeWhere("view"),
  ]);

  const [salesRows, purchaseRows] = await Promise.all([
    prisma.document.groupBy({
      by: ["jobId"],
      where: {
        businessId,
        jobId: { in: jobIds },
        type: "invoice",
        status: { not: "cancelled" },
        ...documentVisibility,
      },
      _sum: { total: true },
      _count: true,
    }),
    prisma.purchaseInvoice.groupBy({
      by: ["jobId"],
      where: {
        businessId,
        jobId: { in: jobIds },
        status: { not: "cancelled" },
        ...purchaseInvoiceVisibility,
      },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  for (const row of salesRows) {
    if (!row.jobId) continue;
    const summary = summaries.get(row.jobId);
    if (summary) {
      summary.salesInvoiceCount = row._count;
      summary.totalBilled = row._sum.total ?? new Decimal(0);
    }
  }
  for (const row of purchaseRows) {
    if (!row.jobId) continue;
    const summary = summaries.get(row.jobId);
    if (summary) {
      summary.purchaseInvoiceCount = row._count;
      summary.totalCost = row._sum.total ?? new Decimal(0);
    }
  }

  return summaries;
}

export async function getJobPnlSummary(
  businessId: string,
  jobId: string,
): Promise<JobPnlSummary> {
  const summaries = await getJobsPnlSummaries(businessId, [jobId]);
  return summaries.get(jobId)!;
}
