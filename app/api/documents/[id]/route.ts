import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { documentUpdateSchema, type LineItemInput } from "@/lib/validation/document";
import { calculateLineAmount } from "@/lib/documents/calculations";
import { isEditableStatus, isManuallySettableStatus, isValidStatus } from "@/lib/documents/status";
import {
  buildBusinessSnapshot,
  buildCustomerSnapshot,
} from "@/lib/documents/snapshots";
import { calculateDocumentTotals } from "@/lib/tax/calculateDocumentTotals";
import { isSameState } from "@/lib/tax/calculateGST";
import { resolveGstRate } from "@/lib/tax/resolveGstRate";

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

    // Resolved once here and stored on each LineItem — never re-resolved
    // live, so a later change to a product's rate or the business default
    // can't retroactively alter this document's tax (see resolveGstRate).
    let resolvedItems: Array<
      LineItemInput & { resolvedGstRate: ReturnType<typeof resolveGstRate> }
    > = [];

    if (lineItems && lineItems.length > 0) {
      const productIds = [
        ...new Set(
          lineItems
            .map((item) => item.productId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const products = productIds.length
        ? await prisma.product.findMany({
            where: { id: { in: productIds }, businessId: business.id },
          })
        : [];
      const productsById = new Map(products.map((p) => [p.id, p]));

      resolvedItems = lineItems.map((item) => ({
        ...item,
        resolvedGstRate: resolveGstRate(
          item.gstRate,
          item.productId ? productsById.get(item.productId)?.gstRate : null,
          business.gstDefaultRate,
        ),
      }));
    }

    const sameState = isSameState(business.placeOfSupply, customer.state);
    const totals = lineItems
      ? calculateDocumentTotals(
          resolvedItems.map((item) => ({
            ...item,
            gstRate: item.resolvedGstRate,
          })),
          { gstEnabled: business.gstEnabled, sameState },
        )
      : undefined;

    const updated = await prisma.$transaction(async (tx) => {
      if (lineItems) {
        await tx.lineItem.deleteMany({ where: { documentId: id } });

        if (resolvedItems.length > 0) {
          await tx.lineItem.createMany({
            data: resolvedItems.map((item, index) => ({
              documentId: id,
              productId: item.productId ?? null,
              name: item.name,
              description: item.description ?? null,
              qty: item.qty,
              rate: item.rate,
              discountPct: item.discountPct ?? 0,
              gstRate: item.resolvedGstRate,
              amount: calculateLineAmount(item),
              sortOrder: index,
            })),
          });
        }
      }

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
                cgst: totals.cgst,
                sgst: totals.sgst,
                igst: totals.igst,
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusiness();
    const { id } = await params;

    const existing = await prisma.document.findFirst({
      where: { id, businessId: business.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (!isEditableStatus(existing.status)) {
      return NextResponse.json(
        { error: "Only draft documents can be deleted" },
        { status: 403 },
      );
    }

    await prisma.document.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
