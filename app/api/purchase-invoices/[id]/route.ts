import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { purchaseInvoiceUpdateSchema } from "@/lib/validation/purchase-invoice";
import { requireEditablePurchaseInvoice } from "@/lib/purchase-invoices/status";
import { purchaseInvoiceScopeWhere } from "@/lib/purchase-invoices/visibility";
import { buildBusinessSnapshot } from "@/lib/documents/snapshots";
import { buildVendorSnapshot } from "@/lib/purchase-invoices/snapshots";
import { calculatePurchaseInvoiceTotals, resolvePurchaseLineFcFields } from "@/lib/purchase-invoices/totals";
import { isSameState } from "@/lib/tax/calculateGST";
import { applyRounding } from "@/lib/tax/applyRounding";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusiness();
    await requirePermission("purchase_invoices.view");
    const { id } = await params;

    const purchaseInvoice = await prisma.purchaseInvoice.findFirst({
      where: { id, businessId: business.id, ...(await purchaseInvoiceScopeWhere("view")) },
      include: {
        vendor: true,
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!purchaseInvoice) {
      return NextResponse.json({ error: "Purchase invoice not found" }, { status: 404 });
    }

    return NextResponse.json({ purchaseInvoice });
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
    await requirePermission("purchase_invoices.edit");
    const { id } = await params;

    // "mutate" scope — same reasoning as documentScopeWhere("mutate"):
    // a Manager editing a subordinate's purchase invoice isn't
    // supported in Phase 1 (no reassign route exists for this model).
    const existing = await prisma.purchaseInvoice.findFirst({
      where: { id, businessId: business.id, ...(await purchaseInvoiceScopeWhere("mutate")) },
      include: { vendor: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Purchase invoice not found" }, { status: 404 });
    }
    requireEditablePurchaseInvoice(existing.status);

    const input = purchaseInvoiceUpdateSchema.parse(await request.json());

    let vendor = existing.vendor;
    if (input.vendorId && input.vendorId !== existing.vendorId) {
      const found = await prisma.vendor.findFirst({
        where: { id: input.vendorId, businessId: business.id },
      });
      if (!found) {
        return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
      }
      vendor = found;
    }

    const { lineItems, vendorId: _vendorId, ...contentFields } = input;
    void _vendorId;

    const sameState = isSameState(vendor.state, business.placeOfSupply);
    const totals = lineItems
      ? calculatePurchaseInvoiceTotals(
          lineItems.map((item) => ({ ...item, gstRate: item.gstRate ?? null })),
          { gstEnabled: business.gstEnabled, sameState },
        )
      : undefined;

    const effectiveRoundTotal = input.roundTotal ?? existing.roundTotal;
    const shouldRecomputeTotal = totals !== undefined || input.roundTotal !== undefined;
    const rounding = shouldRecomputeTotal
      ? applyRounding(
          Number(
            (totals?.taxableAmount ?? existing.taxableAmount)
              .plus(totals?.cgst ?? existing.cgst)
              .plus(totals?.sgst ?? existing.sgst)
              .plus(totals?.igst ?? existing.igst),
          ),
          effectiveRoundTotal,
        )
      : undefined;

    const exchangeRate = input.exchangeRate ?? existing.exchangeRate;

    const updated = await prisma.$transaction(async (tx) => {
      if (lineItems) {
        await tx.purchaseLineItem.deleteMany({ where: { purchaseInvoiceId: id } });

        if (lineItems.length > 0) {
          await tx.purchaseLineItem.createMany({
            data: lineItems.map((item, index) => {
              const lineTotals = calculatePurchaseInvoiceTotals(
                [{ ...item, gstRate: item.gstRate ?? null }],
                { gstEnabled: business.gstEnabled, sameState },
              );
              const amountInr =
                item.amountInr != null
                  ? new Prisma.Decimal(item.amountInr)
                  : exchangeRate != null
                    ? new Prisma.Decimal(item.qty)
                        .mul(item.rate)
                        .mul(exchangeRate)
                        .toDecimalPlaces(2)
                    : null;

              const fc = resolvePurchaseLineFcFields(item);

              return {
                purchaseInvoiceId: id,
                description: item.description,
                sac: item.sac ?? null,
                qty: item.qty,
                unit: item.unit ?? null,
                rate: item.rate,
                amount: lineTotals.subtotal,
                amountInr,
                taxableAmount: lineTotals.taxableAmount,
                gstRate: item.gstRate ?? null,
                cgst: lineTotals.cgst,
                sgst: lineTotals.sgst,
                igst: lineTotals.igst,
                sortOrder: index,
                rateFC: fc.rateFC,
                exRate: fc.exRate,
                fcCurrency: fc.fcCurrency,
                amountFC: fc.amountFC,
              };
            }),
          });
        }
      }

      return tx.purchaseInvoice.update({
        where: { id },
        data: {
          ...contentFields,
          ...(input.vendorId ? { vendorId: vendor.id } : {}),
          vendorSnapshot: buildVendorSnapshot(vendor),
          businessSnapshot: buildBusinessSnapshot(business),
          ...(totals
            ? {
                subtotal: totals.subtotal,
                taxableAmount: totals.taxableAmount,
                cgst: totals.cgst,
                sgst: totals.sgst,
                igst: totals.igst,
              }
            : {}),
          ...(rounding
            ? {
                total: new Prisma.Decimal(rounding.total),
                roundingAdjustment: new Prisma.Decimal(rounding.roundingAdjustment),
              }
            : {}),
        },
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
      });
    });

    return NextResponse.json({ purchaseInvoice: updated });
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
    await requirePermission("purchase_invoices.delete");
    const { id } = await params;

    const existing = await prisma.purchaseInvoice.findFirst({
      where: { id, businessId: business.id, ...(await purchaseInvoiceScopeWhere("mutate")) },
    });
    if (!existing) {
      return NextResponse.json({ error: "Purchase invoice not found" }, { status: 404 });
    }
    requireEditablePurchaseInvoice(existing.status);

    await prisma.purchaseInvoice.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
