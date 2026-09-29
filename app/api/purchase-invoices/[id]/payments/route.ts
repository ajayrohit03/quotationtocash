import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { vendorPaymentCreateSchema } from "@/lib/validation/vendor-payment";
import { deriveVendorInvoiceStatus, requireRecordableVendorPayment } from "@/lib/purchase-invoices/status";
import { purchaseInvoiceScopeWhere } from "@/lib/purchase-invoices/visibility";

// The single mechanism for both "mark fully paid" (amount === remaining
// balance) and "log a partial payment" — same design as
// POST /api/documents/:id/payments, direction reversed. amount may also
// exceed the remaining balance, which is allowed and becomes a tracked
// credit balance rather than being rejected. Owner/admin only
// (purchase_invoices.pay) — see docs/accounts-payable-phase1-design.md
// §8.
export async function POST(
  request: NextRequest,
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
    requireRecordableVendorPayment(purchaseInvoice.status);

    const input = vendorPaymentCreateSchema.parse(await request.json());
    const amount = new Prisma.Decimal(input.amount);
    const newAmountPaid = purchaseInvoice.amountPaid.add(amount);
    const nextStatus = deriveVendorInvoiceStatus(
      purchaseInvoice.status,
      Number(purchaseInvoice.total),
      Number(newAmountPaid),
    );

    const [payment, updated] = await prisma.$transaction([
      prisma.vendorPayment.create({
        data: {
          purchaseInvoiceId: purchaseInvoice.id,
          amount,
          method: input.method ?? null,
          paidAt: input.paidAt ?? new Date(),
          note: input.note ?? null,
          recordedByUserId: user.id,
        },
      }),
      prisma.purchaseInvoice.update({
        where: { id: purchaseInvoice.id },
        data: { amountPaid: newAmountPaid, status: nextStatus },
      }),
    ]);

    return NextResponse.json({ purchaseInvoice: updated, payment }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
