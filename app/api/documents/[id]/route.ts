import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { documentUpdateSchema } from "@/lib/validation/document";
import { calculateBaseTotals, calculateLineAmount } from "@/lib/documents/calculations";
import { isEditableStatus, isManuallySettableStatus, isValidStatus } from "@/lib/documents/status";
import {
  buildBusinessSnapshot,
  buildCustomerSnapshot,
} from "@/lib/documents/snapshots";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusiness();
    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: { id, businessId: business.id },
      include: {
        customer: true,
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ document });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusiness();
    const { id } = await params;

    const existing = await prisma.document.findFirst({
      where: { id, businessId: business.id },
      include: { customer: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (!isEditableStatus(existing.status)) {
      return NextResponse.json(
        { error: "This document is no longer editable" },
        { status: 403 },
      );
    }

    const input = documentUpdateSchema.parse(await request.json());

    if (input.status !== undefined) {
      if (
        !isValidStatus(existing.type, input.status) ||
        !isManuallySettableStatus(existing.type, input.status)
      ) {
        return NextResponse.json(
          { error: `"${input.status}" can't be set directly` },
          { status: 400 },
        );
      }
    }

    let customer = existing.customer;
    if (input.customerId && input.customerId !== existing.customerId) {
      const found = await prisma.customer.findFirst({
        where: { id: input.customerId, businessId: business.id },
      });
      if (!found) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }
      customer = found;
    }

    const { lineItems, status, ...contentFields } = input;

    const updated = await prisma.$transaction(async (tx) => {
      if (lineItems) {
        await tx.lineItem.deleteMany({ where: { documentId: id } });

        if (lineItems.length > 0) {
          await tx.lineItem.createMany({
            data: lineItems.map((item, index) => ({
              documentId: id,
              productId: item.productId ?? null,
              name: item.name,
              description: item.description ?? null,
              qty: item.qty,
              rate: item.rate,
              discountPct: item.discountPct ?? 0,
              gstRate: item.gstRate ?? null,
              amount: calculateLineAmount(item),
              sortOrder: index,
            })),
          });
        }
      }

      const totals = lineItems
        ? calculateBaseTotals(lineItems)
        : undefined;

      return tx.document.update({
        where: { id },
        data: {
          ...contentFields,
          ...(status !== undefined ? { status } : {}),
          customerSnapshot: buildCustomerSnapshot(customer),
          businessSnapshot: buildBusinessSnapshot(business),
          ...(totals
            ? {
                subtotal: totals.subtotal,
                discountTotal: totals.discountTotal,
                taxableAmount: totals.taxableAmount,
                total: totals.total,
              }
            : {}),
        },
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
      });
    });

    return NextResponse.json({ document: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
