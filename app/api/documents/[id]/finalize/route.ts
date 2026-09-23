import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { requireFinalizableDocument } from "@/lib/documents/status";
import { documentScopeWhere } from "@/lib/documents/visibility";

// Locks a draft invoice or proforma from further editing — a one-way
// door, unlike mark-unpaid which reverses a payment. There is
// deliberately no un-finalize endpoint: if the content needs to change,
// the user deletes and recreates, or adds an addendum via Notes (see
// spec). Quotations don't finalize — they get converted instead (see
// convert/route.ts).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusiness();
    const { id } = await params;

    // "mutate" scope, same as every other document-mutating action — a
    // Manager finalizing a subordinate's document requires reassigning
    // it first. See docs/permission-layer-design.md §5, §6.
    const document = await prisma.document.findFirst({
      where: { id, businessId: business.id, ...(await documentScopeWhere("mutate")) },
    });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (document.type !== "invoice" && document.type !== "proforma") {
      return NextResponse.json(
        { error: "Only invoices and proforma invoices can be finalized." },
        { status: 400 },
      );
    }
    // Same invoices.* permission tier proforma already reuses elsewhere
    // (see app/api/documents/[id]/route.ts's own comment) — Owner/Admin/
    // Manager, same as mark-paid.
    await requirePermission("invoices.edit");
    requireFinalizableDocument(document.status);

    const updated = await prisma.document.update({
      where: { id: document.id },
      data: { status: "finalized" },
    });

    return NextResponse.json({ document: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
