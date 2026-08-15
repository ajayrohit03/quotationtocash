import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

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

  const [invoicedRows, outstandingRows] = await Promise.all([
    prisma.document.groupBy({
      by: ["customerId"],
      where: {
        businessId,
        customerId: { in: customerIds },
        type: "invoice",
        status: { in: INVOICED_STATUSES },
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
