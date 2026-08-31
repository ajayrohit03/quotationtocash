import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { deriveInvoiceStatus, requireRecordablePaymentInvoice } from "@/lib/documents/status";
import { documentScopeWhere } from "@/lib/documents/visibility";
import { requirePermission } from "@/lib/auth/permissions";
import { paymentCreateSchema } from "@/lib/validation/payment";

// Replaces mark-paid — see docs/payment-tracking-design.md. The single
// mechanism for both "mark fully paid" (amount === remaining balance)
// and "log a partial payment" (amount < remaining balance); amount may
// also exceed the remaining balance, which is allowed and becomes a
// tracked credit balance rather than being rejected.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business, user } = await requireBusiness();
    const { id } = await params;

    // Same "mutate" scope as every other document-mutating action.
    const document = await prisma.document.findFirst({
      where: { id, businessId: business.id, ...(await documentScopeWhere("mutate")) },
    });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (document.type !== "invoice") {
      return NextResponse.json(
        { error: "Only invoices can have payments recorded against them." },
        { status: 400 },
      );
    }
    await requirePermission("invoices.edit");
    requireRecordablePaymentInvoice(document.status);

    const input = paymentCreateSchema.parse(await request.json());
    const amount = new Prisma.Decimal(input.amount);
    const newAmountPaid = document.amountPaid.add(amount);
    const nextStatus = deriveInvoiceStatus(
      document.status,
      Number(document.total),
      Number(newAmountPaid),
    );

    const [payment, updated] = await prisma.$transaction([
      prisma.payment.create({
        data: {
          invoiceId: document.id,
          amount,
          paidAt: input.paidAt ?? new Date(),
          note: input.note ?? null,
          recordedByUserId: user.id,
        },
      }),
      prisma.document.update({
        where: { id: document.id },
        data: { amountPaid: newAmountPaid, status: nextStatus },
      }),
    ]);

    return NextResponse.json({ document: updated, payment }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
