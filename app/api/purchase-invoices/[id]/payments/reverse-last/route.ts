import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { deriveVendorInvoiceStatus } from "@/lib/purchase-invoices/status";
import { purchaseInvoiceScopeWhere } from "@/lib/purchase-invoices/visibility";
import { formatCurrency } from "@/lib/format";
import { formatDateIST } from "@/lib/dates";

// Reverses the single most recent VendorPayment (by paidAt, tie-broken
// by createdAt) — same design as
// POST /api/documents/:id/payments/reverse-last, direction reversed.
// Leaves the same kind of one-time trace note on Notes: the
// VendorPayment row itself is the audit record for a forward payment,
// but a reversal has no other record once the row is gone. Owner/admin
// only (purchase_invoices.pay) — same tier as recording a payment.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business, user } = await requireBusiness();
    await requirePermission("purchase_invoices.pay");
    const { id } = await params;

    const purchaseInvoice = await prisma.purchaseInvoice.findFirst({
      where: { id, businessId: business.id, ...(await purchaseInvoiceScopeWhere("mutate")) },
    });
    if (!purchaseInvoice) {
      return NextResponse.json({ error: "Purchase invoice not found" }, { status: 404 });
    }

    const lastPayment = await prisma.vendorPayment.findFirst({
      where: { purchaseInvoiceId: purchaseInvoice.id },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    });
    if (!lastPayment) {
      return NextResponse.json(
        { error: "This purchase invoice has no payments to reverse." },
        { status: 400 },
      );
    }

    const newAmountPaid = purchaseInvoice.amountPaid.sub(lastPayment.amount);
    const nextStatus = deriveVendorInvoiceStatus(
      purchaseInvoice.status,
      Number(purchaseInvoice.total),
      Number(newAmountPaid),
    );

    const actorName = user.name ?? user.email;
    const revertedAt = formatDateIST(new Date(), {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const traceNote = `Payment of ${formatCurrency(lastPayment.amount, purchaseInvoice.currency)} (recorded ${formatDateIST(lastPayment.paidAt, { day: "2-digit", month: "long", year: "numeric" })}) reversed by ${actorName} on ${revertedAt}.`;
    const newNotes = purchaseInvoice.notes ? `${traceNote}\n\n${purchaseInvoice.notes}` : traceNote;

    const [, updated] = await prisma.$transaction([
      prisma.vendorPayment.delete({ where: { id: lastPayment.id } }),
      prisma.purchaseInvoice.update({
        where: { id: purchaseInvoice.id },
        data: { amountPaid: newAmountPaid, status: nextStatus, notes: newNotes },
      }),
    ]);

    return NextResponse.json({ purchaseInvoice: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
