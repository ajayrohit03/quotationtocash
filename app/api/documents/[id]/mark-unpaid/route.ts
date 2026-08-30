import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { requireMarkUnpaidInvoice } from "@/lib/documents/status";
import { documentScopeWhere } from "@/lib/documents/visibility";
import { requirePermission } from "@/lib/auth/permissions";

// The reverse of mark-paid — for the case where an invoice was marked
// paid too quickly and needs correcting. Always reverts to "draft" (not
// "sent"), reusing requireEditableDocument()'s existing draft-only rule
// rather than extending editability to a second status. Prepends a
// one-time trace note recording the reversal; see the notes-prepend
// comment below for why that isn't a live-editable annotation.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business, user } = await requireBusiness();
    const { id } = await params;

    // Same "mutate" scope as mark-paid — own documents only.
    const document = await prisma.document.findFirst({
      where: { id, businessId: business.id, ...(await documentScopeWhere("mutate")) },
    });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (document.type !== "invoice") {
      return NextResponse.json(
        { error: "Only invoices can be marked as unpaid." },
        { status: 400 },
      );
    }
    // Same permission check as mark-paid — whoever can mark paid can
    // reverse it.
    await requirePermission("invoices.edit");
    requireMarkUnpaidInvoice(document.status);

    const actorName = user.name ?? user.email;
    const revertedAt = new Date();
    const traceNote = `Marked unpaid by ${actorName} on ${revertedAt.toLocaleDateString(
      "en-IN",
      { year: "numeric", month: "long", day: "numeric" },
    )} — was previously paid.`;
    // One-time record of the event, prepended to the existing Notes
    // value. Not stored as its own field: this app has no generic
    // audit-log table, and this single case doesn't warrant adding one.
    // Deliberately baked into `notes` at the moment of the transition —
    // if the user edits or clears Notes afterward themselves, that's
    // fine; this is a record of what happened, not a live annotation
    // that has to keep tracking the field's current value.
    const newNotes = document.notes ? `${traceNote}\n\n${document.notes}` : traceNote;

    const updated = await prisma.document.update({
      where: { id },
      data: { status: "draft", notes: newNotes },
    });

    return NextResponse.json({ document: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
