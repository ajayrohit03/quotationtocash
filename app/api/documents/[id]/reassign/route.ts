import { NextResponse, type NextRequest } from "next/server";
import type { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { documentScopeWhere } from "@/lib/documents/visibility";
import { requireEditableDocument } from "@/lib/documents/status";

const EDIT_PERMISSION: Record<DocumentType, Permission> = {
  quotation: "quotations.edit",
  invoice: "invoices.edit",
};

// The sole bridge from "I can see it" to "I can edit it" for a document
// outside your own mutate-scope (see docs/permission-layer-design.md §5)
// — sets createdByUserId to the caller's own id. After this single
// write, the document is the caller's own document under every existing
// rule; PATCH/DELETE/convert/mark-paid/send/share need zero
// special-casing to then allow editing it.
//
// Deliberately no shared multi-editor access, no team-wide mutate scope:
// the original hierarchy design doc's Fork A specifically wanted to
// avoid that (concurrent-edit complexity, no audit trail for "who
// actually changed this," interaction with the draft-lock system) — this
// action is the explicit, visible, single-owner alternative it proposed
// instead.
//
// Restricted to draft documents: the primary use case is "let me take
// over editing this," not "fix a historical record" on something already
// sent/paid/converted — requireEditableDocument() is the same check
// PATCH/DELETE already use for that exact line.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireBusiness();
    const { business, user } = context;
    const { id } = await params;

    // "view" scope, not "mutate" — reassignment is precisely the action
    // that's available on documents you can see but don't yet own.
    const document = await prisma.document.findFirst({
      where: { id, businessId: business.id, ...(await documentScopeWhere("view")) },
    });
    if (!document || !(await hasPermission(context, EDIT_PERMISSION[document.type]))) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    requireEditableDocument(document.status);

    if (document.createdByUserId === user.id) {
      // Harmless no-op — already their own document.
      return NextResponse.json({ document });
    }

    const updated = await prisma.document.update({
      where: { id },
      data: { createdByUserId: user.id },
    });

    return NextResponse.json({ document: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
