import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { DocumentType } from "@prisma/client";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import {
  DEFAULT_STATUS_GROUPS,
  DEFAULT_TYPES,
  REPORT_DOCUMENT_TYPES,
  STATUS_GROUP_KEYS,
  buildCsv,
  reportFilename,
} from "@/lib/reports/gst-summary";
import { ReportTooLargeError, getGstSummaryRows } from "@/lib/reports/gst-summary-query";
import { buildGstSummaryWorkbook } from "@/lib/reports/gst-summary-xlsx";

// Same read tier as viewing the documents themselves — proforma reuses the
// invoices.* permission (see app/api/documents/route.ts).
const VIEW_PERMISSION: Record<DocumentType, Permission> = {
  quotation: "quotations.view",
  invoice: "invoices.view",
  proforma: "invoices.view",
};

const MAX_RANGE_DAYS = 800;
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

function csvList<T extends string>(values: readonly [T, ...T[]], fallback: readonly T[]) {
  return z
    .string()
    .optional()
    .transform((raw) => (raw === undefined || raw === "" ? [...fallback] : raw.split(",").map((s) => s.trim())))
    .pipe(z.array(z.enum(values)).min(1));
}

const querySchema = z
  .object({
    from: dateString,
    to: dateString,
    statuses: csvList(STATUS_GROUP_KEYS as [(typeof STATUS_GROUP_KEYS)[number], ...(typeof STATUS_GROUP_KEYS)[number][]], DEFAULT_STATUS_GROUPS),
    types: csvList(REPORT_DOCUMENT_TYPES as unknown as [(typeof REPORT_DOCUMENT_TYPES)[number], ...(typeof REPORT_DOCUMENT_TYPES)[number][]], DEFAULT_TYPES),
    format: z.enum(["json", "xlsx", "csv"]).default("json"),
  })
  .superRefine((q, ctx) => {
    const from = Date.parse(`${q.from}T00:00:00Z`);
    const to = Date.parse(`${q.to}T00:00:00Z`);
    if (Number.isNaN(from) || Number.isNaN(to)) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
    } else if (from > to) {
      ctx.addIssue({ code: "custom", message: "'from' must not be after 'to'", path: ["from"] });
    } else if ((to - from) / 86_400_000 > MAX_RANGE_DAYS) {
      ctx.addIssue({ code: "custom", message: `Date range is limited to ${MAX_RANGE_DAYS} days`, path: ["to"] });
    }
  });

// GET /api/reports/gst-summary?from=&to=&statuses=&types=&format=
// statuses: comma-separated groups of draft,sent,finalized,paid (cancelled
// is always excluded). types: invoice,quotation,proforma. format: json
// (default — a plain array of rows) | xlsx | csv (file downloads).
export async function GET(request: NextRequest) {
  try {
    const context = await requireBusiness();
    const { business } = context;
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

    for (const type of query.types) {
      if (!(await hasPermission(context, VIEW_PERMISSION[type]))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const rows = await getGstSummaryRows({
      businessId: business.id,
      from: query.from,
      to: query.to,
      statusGroups: query.statuses,
      types: query.types,
    });

    if (query.format === "json") return NextResponse.json(rows);

    const noStore = { "Cache-Control": "private, no-store" };
    if (query.format === "csv") {
      return new NextResponse(buildCsv(rows), {
        headers: {
          ...noStore,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${reportFilename(query.from, query.to, "csv")}"`,
        },
      });
    }

    const workbook = await buildGstSummaryWorkbook(rows);
    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        ...noStore,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${reportFilename(query.from, query.to, "xlsx")}"`,
      },
    });
  } catch (error) {
    if (error instanceof ReportTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return errorResponse(error);
  }
}
