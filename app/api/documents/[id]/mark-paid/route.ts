import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { requireMarkPayableInvoice } from "@/lib/documents/status";
import { documentScopeWhere } from "@/lib/documents/visibility";
import { requirePermission } from "@/lib/auth/permissions";

// The only code path allowed to set status = "paid" (see the restricted-
// statuses comment in lib/documents/status.ts). Full payment only — the
// Payment model exists for later partial-payment tracking but has no
// API/UI yet (see its own schema comment), so this just flips status.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusiness();
    const { id } = await params;

    // "mutate" scope — own documents only; marking a subordinate's
    // invoice paid requires reassigning it first. See
    // docs/permission-layer-design.md §5.
    const document = await prisma.document.findFirst({
      where: { id, businessId: business.id, ...(await documentScopeWhere("mutate")) },
    });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (document.type !== "invoice") {
      return NextResponse.json(
        { error: "Only invoices can be marked as paid." },
        { status: 400 },
      );
    }
    await requirePermission("invoices.edit");
    requireMarkPayableInvoice(document.status);

    const updated = await prisma.document.update({
      where: { id },
      data: { status: "paid" },
    });

    return NextResponse.json({ document: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
