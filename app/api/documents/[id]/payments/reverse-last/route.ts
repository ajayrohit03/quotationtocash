import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { deriveInvoiceStatus } from "@/lib/documents/status";
import { documentScopeWhere } from "@/lib/documents/visibility";
import { requirePermission } from "@/lib/auth/permissions";
import { formatCurrency } from "@/lib/format";
import { formatDateIST } from "@/lib/dates";

// Replaces mark-unpaid — see docs/payment-tracking-design.md §2. Reverses
// the single most recent payment (by paidAt, tie-broken by createdAt),
// which generalizes mark-unpaid's "undo marking it paid too quickly" to
// a document with any number of payments. Leaves the same kind of
// one-time trace note on Notes that mark-unpaid did — the Payment row
// itself is the audit record for a forward payment, but a reversal has
// no other record once the row is gone.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business, user } = await requireBusiness();
    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: { id, businessId: business.id, ...(await documentScopeWhere("mutate")) },
    });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (document.type !== "invoice") {
      return NextResponse.json(
        { error: "Only invoices can have payments reversed." },
        { status: 400 },
      );
    }
    await requirePermission("invoices.edit");

    const lastPayment = await prisma.payment.findFirst({
      where: { invoiceId: document.id },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    });
    if (!lastPayment) {
      return NextResponse.json(
        { error: "This invoice has no payments to reverse." },
        { status: 400 },
      );
    }

    const newAmountPaid = document.amountPaid.sub(lastPayment.amount);
    const nextStatus = deriveInvoiceStatus(
      document.status,
      Number(document.total),
      Number(newAmountPaid),
    );

    const actorName = user.name ?? user.email;
    const revertedAt = formatDateIST(new Date(), {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const traceNote = `Payment of ${formatCurrency(lastPayment.amount, document.currency)} (recorded ${formatDateIST(lastPayment.paidAt, { day: "2-digit", month: "long", year: "numeric" })}) reversed by ${actorName} on ${revertedAt}.`;
    const newNotes = document.notes ? `${traceNote}\n\n${document.notes}` : traceNote;

    const [, updated] = await prisma.$transaction([
      prisma.payment.delete({ where: { id: lastPayment.id } }),
      prisma.document.update({
        where: { id: document.id },
        data: { amountPaid: newAmountPaid, status: nextStatus, notes: newNotes },
      }),
    ]);

    return NextResponse.json({ document: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
