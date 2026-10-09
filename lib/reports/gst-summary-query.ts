import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { documentScopeWhere } from "@/lib/documents/visibility";
import {
  buildGstSummaryRow,
  statusesForGroups,
  type GstSummaryRow,
  type ReportDocumentType,
  type StatusGroup,
} from "./gst-summary";

// A tax export must never be silently truncated, so past this we refuse
// rather than return a partial list.
export const MAX_REPORT_ROWS = 20_000;

export class ReportTooLargeError extends Error {
  constructor() {
    super(`More than ${MAX_REPORT_ROWS} documents match — narrow the date range.`);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

// `from`/`to` are inclusive IST calendar dates ("YYYY-MM-DD"). issueDate is
// a date-only value stored as UTC midnight, so the range is [from, to+1d).
export async function getGstSummaryRows(opts: {
  businessId: string;
  from: string;
  to: string;
  statusGroups: readonly StatusGroup[];
  types: readonly ReportDocumentType[];
}): Promise<GstSummaryRow[]> {
  const start = new Date(`${opts.from}T00:00:00.000Z`);
  const endExclusive = new Date(new Date(`${opts.to}T00:00:00.000Z`).getTime() + DAY_MS);

  const conditions: Prisma.DocumentWhereInput[] = [await documentScopeWhere("view")];

  const documents = await prisma.document.findMany({
    where: {
      businessId: opts.businessId,
      type: { in: [...opts.types] },
      status: { in: statusesForGroups(opts.statusGroups) },
      issueDate: { gte: start, lt: endExclusive },
      AND: conditions,
    },
    orderBy: [{ issueDate: "asc" }, { number: "asc" }],
    take: MAX_REPORT_ROWS + 1,
    select: {
      number: true,
      type: true,
      issueDate: true,
      status: true,
      currency: true,
      taxableAmount: true,
      cgst: true,
      sgst: true,
      igst: true,
      total: true,
      customerSnapshot: true,
      businessSnapshot: true,
      lineItems: { select: { gstRate: true } },
    },
  });

  if (documents.length > MAX_REPORT_ROWS) throw new ReportTooLargeError();

  return documents.map((doc) =>
    buildGstSummaryRow({
      number: doc.number,
      type: doc.type,
      issueDate: doc.issueDate,
      status: doc.status,
      currency: doc.currency,
      taxableAmount: Number(doc.taxableAmount),
      cgst: Number(doc.cgst),
      sgst: Number(doc.sgst),
      igst: Number(doc.igst),
      total: Number(doc.total),
      customerSnapshot: doc.customerSnapshot as GstSummaryRowSource["customerSnapshot"],
      businessSnapshot: doc.businessSnapshot as GstSummaryRowSource["businessSnapshot"],
      lineItems: doc.lineItems.map((l) => ({ gstRate: l.gstRate == null ? null : Number(l.gstRate) })),
    }),
  );
}

type GstSummaryRowSource = Parameters<typeof buildGstSummaryRow>[0];
