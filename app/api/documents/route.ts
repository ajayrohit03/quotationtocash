import { NextResponse, type NextRequest } from "next/server";
import type { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { documentCreateSchema } from "@/lib/validation/document";
import { getNextDocumentNumber } from "@/lib/documents/numbering";
import {
  buildBusinessSnapshot,
  buildCustomerSnapshot,
} from "@/lib/documents/snapshots";

const DOCUMENT_TYPES: readonly DocumentType[] = ["quotation", "invoice"];

export async function GET(request: NextRequest) {
  try {
    const { business } = await requireBusiness();
    const params = request.nextUrl.searchParams;
    const type = params.get("type");
    const status = params.get("status");
    const search = params.get("q")?.trim();

    if (type && !DOCUMENT_TYPES.includes(type as DocumentType)) {
      return NextResponse.json({ error: "Invalid type filter" }, { status: 400 });
    }

    const documents = await prisma.document.findMany({
      where: {
        businessId: business.id,
        ...(type ? { type: type as DocumentType } : {}),
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { number: { contains: search, mode: "insensitive" } },
                { customer: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { id: true, name: true, company: true } } },
    });

    return NextResponse.json({ documents });
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
    const { business } = await requireBusiness();
    const input = documentCreateSchema.parse(await request.json());

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
        issueDate: new Date(),
        template: business.documentTemplate,
        accentColor: business.accentColor,
        showTax: business.gstEnabled,
        customerSnapshot: buildCustomerSnapshot(customer),
        businessSnapshot: buildBusinessSnapshot(business),
      },
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
