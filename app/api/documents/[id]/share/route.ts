import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { publicDocumentUrl } from "@/lib/documents/public-url";
import { documentScopeWhere } from "@/lib/documents/visibility";
import { hasPermission, type Permission } from "@/lib/auth/permissions";

const EDIT_PERMISSION: Record<"quotation" | "invoice", Permission> = {
  quotation: "quotations.edit",
  invoice: "invoices.edit",
};

// (Re)generates the public share token — spec calls this out as
// "(re)generate", so every call issues a fresh token rather than reusing
// an existing one, invalidating any previously shared link. Allowed at
// any status: sharing a link is the owner's call, independent of where
// the document sits in its own workflow.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireBusiness();
    const { business } = context;
    const { id } = await params;

    // "mutate" scope — regenerating a share token writes to the
    // document. See docs/permission-layer-design.md §5, §6.
    const existing = await prisma.document.findFirst({
      where: { id, businessId: business.id, ...(await documentScopeWhere("mutate")) },
    });
    if (!existing || !(await hasPermission(context, EDIT_PERMISSION[existing.type]))) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const shareToken = randomBytes(24).toString("hex");
    await prisma.document.update({ where: { id }, data: { shareToken } });

    return NextResponse.json({ shareUrl: publicDocumentUrl(shareToken, business.slug) });
  } catch (error) {
    return errorResponse(error);
  }
}
