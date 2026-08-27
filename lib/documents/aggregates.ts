import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { documentScopeWhere } from "@/lib/documents/visibility";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

// "Invoiced" / "outstanding" only make sense once an invoice has actually
// gone out — a draft isn't billed yet, and a cancelled one never was.
const INVOICED_STATUSES = [
  "sent",
  "viewed",
  "partially_paid",
  "paid",
  "overdue",
];
const OUTSTANDING_STATUSES = ["sent", "viewed", "partially_paid", "overdue"];

export type CustomerBillingSummary = {
  totalInvoiced: Decimal;
  outstanding: Decimal;
};

// Batched (groupBy) rather than one aggregate query per customer — for the
// customers list page, which needs this for every row at once.
export async function getCustomersBillingSummaries(
  businessId: string,
  customerIds: string[],
): Promise<Map<string, CustomerBillingSummary>> {
  const summaries = new Map<string, CustomerBillingSummary>(
    customerIds.map((id) => [
      id,
      { totalInvoiced: new Decimal(0), outstanding: new Decimal(0) },
    ]),
  );

  if (customerIds.length === 0) return summaries;

  // Same hierarchy visibility as the documents themselves — otherwise a
  // customer's billing totals here would silently include invoices a
  // non-owner viewer can't otherwise see any of the underlying documents
  // for, defeating the whole point of the access control on this page.
  const visibility = await documentScopeWhere("view");

  const [invoicedRows, outstandingRows] = await Promise.all([
    prisma.document.groupBy({
      by: ["customerId"],
      where: {
        businessId,
        customerId: { in: customerIds },
        type: "invoice",
        status: { in: INVOICED_STATUSES },
        ...visibility,
      },
      _sum: { total: true },
    }),
    prisma.document.groupBy({
      by: ["customerId"],
      where: {
        businessId,
        customerId: { in: customerIds },
        type: "invoice",
        status: { in: OUTSTANDING_STATUSES },
        ...visibility,
      },
      _sum: { total: true },
    }),
  ]);

  for (const row of invoicedRows) {
    const summary = summaries.get(row.customerId);
    if (summary) summary.totalInvoiced = row._sum.total ?? new Decimal(0);
  }
  for (const row of outstandingRows) {
    const summary = summaries.get(row.customerId);
    if (summary) summary.outstanding = row._sum.total ?? new Decimal(0);
  }

  return summaries;
}

export async function getCustomerBillingSummary(
  businessId: string,
  customerId: string,
): Promise<CustomerBillingSummary> {
  const summaries = await getCustomersBillingSummaries(businessId, [
    customerId,
  ]);
  return summaries.get(customerId)!;
}

export type DashboardMetrics = {
  totalRevenue: Decimal;
  outstanding: Decimal;
  overdueCount: number;
  paid: Decimal;
  paidCount: number;
  draftCount: number;
};

// Total revenue = outstanding + paid by construction (both are subsets
// of INVOICED_STATUSES) — invoiced amounts are "revenue" regardless of
// collection status; draft counts across both quotations and invoices.
export async function getDashboardMetrics(
  businessId: string,
): Promise<DashboardMetrics> {
  // Dashboard figures are derived from documents, so they're subject to
  // the same hierarchy visibility as the documents themselves — otherwise
  // a Sales Executive's dashboard would leak company-wide revenue/paid
  // totals they can't otherwise see any of the underlying invoices for.
  const visibility = await documentScopeWhere("view");

  const [revenueAgg, outstandingAgg, overdueCount, paidAgg, draftCount] =
    await Promise.all([
      prisma.document.aggregate({
        where: {
          businessId,
          type: "invoice",
          status: { in: INVOICED_STATUSES },
          ...visibility,
        },
        _sum: { total: true },
      }),
      prisma.document.aggregate({
        where: {
          businessId,
          type: "invoice",
          status: { in: OUTSTANDING_STATUSES },
          ...visibility,
        },
        _sum: { total: true },
      }),
      prisma.document.count({
        where: { businessId, type: "invoice", status: "overdue", ...visibility },
      }),
      prisma.document.aggregate({
        where: { businessId, type: "invoice", status: "paid", ...visibility },
        _sum: { total: true },
        _count: true,
      }),
      prisma.document.count({
        where: { businessId, status: "draft", ...visibility },
      }),
    ]);

  return {
    totalRevenue: revenueAgg._sum.total ?? new Decimal(0),
    outstanding: outstandingAgg._sum.total ?? new Decimal(0),
    overdueCount,
    paid: paidAgg._sum.total ?? new Decimal(0),
    paidCount: paidAgg._count,
    draftCount,
  };
}

export type RecentDocument = {
  id: string;
  number: string;
  type: "quotation" | "invoice";
  status: string;
  issueDate: Date;
  total: Decimal;
  customer: { name: string };
};

export async function getRecentDocuments(
  businessId: string,
  limit: number,
): Promise<RecentDocument[]> {
  const visibility = await documentScopeWhere("view");

  return prisma.document.findMany({
    where: { businessId, ...visibility },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      number: true,
      type: true,
      status: true,
      issueDate: true,
      total: true,
      customer: { select: { name: true } },
    },
  });
}
