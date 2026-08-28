import { NextResponse, type NextRequest } from "next/server";
import type { DocumentType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { hasPermission, requirePermission, type Permission } from "@/lib/auth/permissions";
import { todayInIST } from "@/lib/dates";
import { documentCreateSchema } from "@/lib/validation/document";
import { getNextDocumentNumber } from "@/lib/documents/numbering";
import {
  buildBusinessSnapshot,
  buildCustomerSnapshot,
} from "@/lib/documents/snapshots";
import { documentScopeWhere } from "@/lib/documents/visibility";

const VIEW_PERMISSION: Record<DocumentType, Permission> = {
  quotation: "quotations.view",
  invoice: "invoices.view",
};

const CREATE_PERMISSION: Record<DocumentType, Permission> = {
  quotation: "quotations.create",
  invoice: "invoices.create",
};

const DOCUMENT_TYPES: readonly DocumentType[] = ["quotation", "invoice"];

export async function GET(request: NextRequest) {
  try {
    const context = await requireBusiness();
    const { business } = context;
    const params = request.nextUrl.searchParams;
    const type = params.get("type");
    const status = params.get("status");
    const search = params.get("q")?.trim();
    const skip = Number(params.get("skip") ?? "0");
    const takeParam = Number(params.get("take") ?? "25");
    // Bounded regardless of what's requested — this endpoint backs the
    // list pages' "Load more" button, not a bulk export.
    const take = Number.isFinite(takeParam)
      ? Math.min(Math.max(takeParam, 1), 100)
      : 25;

    if (type && !DOCUMENT_TYPES.includes(type as DocumentType)) {
      return NextResponse.json({ error: "Invalid type filter" }, { status: 400 });
    }
    // A specific type filter has a specific permission to check; an
    // unfiltered list spans both types, which every fixed role that can
    // reach this endpoint already has view access to either way (see
    // docs/permission-layer-design.md §2 — quotations.view/invoices.view
    // are always granted as a pair for every current role).
    if (type && !(await hasPermission(context, VIEW_PERMISSION[type as DocumentType]))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Combined via AND, not spread — scopeWhere and the search filter can
    // each independently produce an `OR` key, and spreading both into the
    // same object would let the second silently clobber the first rather
    // than actually applying both conditions.
    const conditions: Prisma.DocumentWhereInput[] = [await documentScopeWhere("view")];
    if (search) {
      conditions.push({
        OR: [
          { number: { contains: search, mode: "insensitive" } },
          { customer: { name: { contains: search, mode: "insensitive" } } },
        ],
      });
    }

    // Fetch one extra row to know whether another page exists without a
    // separate count query.
    const rows = await prisma.document.findMany({
      where: {
        businessId: business.id,
        ...(type ? { type: type as DocumentType } : {}),
        ...(status ? { status } : {}),
        AND: conditions,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { customer: { select: { id: true, name: true, company: true } } },
      skip,
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const documents = hasMore ? rows.slice(0, take) : rows;

    return NextResponse.json({ documents, hasMore });
  } catch (error) {
    return errorResponse(error);
  }
}

// Creates an empty draft: just a type and a customer. Everything else
// (line items, dates, terms, appearance) is filled in via PATCH as the
// builder (Phase 6) autosaves — this endpoint's job is just to hand back
// a real id to save against.
export async function POST(request: NextRequest) {
  try {
    const { business, user } = await requireBusiness();
    const input = documentCreateSchema.parse(await request.json());
    await requirePermission(CREATE_PERMISSION[input.type]);

    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, businessId: business.id },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const number = await getNextDocumentNumber(business.id, input.type);

    const document = await prisma.document.create({
      data: {
        businessId: business.id,
        type: input.type,
        number,
        customerId: customer.id,
        issueDate: todayInIST(),
        createdByUserId: user.id,
        template: business.documentTemplate,
        accentColor: business.accentColor,
        showTax: business.gstEnabled,
        notes: business.defaultNotes,
        termsText: business.defaultTermsText,
        ...(input.type === "quotation"
          ? { validityTerms: business.defaultValidityTerms }
          : { paymentTerms: business.defaultPaymentTerms }),
        customerSnapshot: buildCustomerSnapshot(customer),
        businessSnapshot: buildBusinessSnapshot(business),
      },
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
