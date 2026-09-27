import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { todayInIST } from "@/lib/dates";
import { purchaseInvoiceCreateSchema } from "@/lib/validation/purchase-invoice";
import { buildBusinessSnapshot } from "@/lib/documents/snapshots";
import { buildVendorSnapshot } from "@/lib/purchase-invoices/snapshots";
import { purchaseInvoiceScopeWhere } from "@/lib/purchase-invoices/visibility";
import { calculatePurchaseInvoiceTotals } from "@/lib/purchase-invoices/totals";
import { isSameState } from "@/lib/tax/calculateGST";
import { applyRounding } from "@/lib/tax/applyRounding";

export async function GET(request: NextRequest) {
  try {
    const { business } = await requireBusiness();
    await requirePermission("purchase_invoices.view");
    const params = request.nextUrl.searchParams;
    const status = params.get("status");
    const search = params.get("q")?.trim();
    const skip = Number(params.get("skip") ?? "0");
    const takeParam = Number(params.get("take") ?? "25");
    const take = Number.isFinite(takeParam)
      ? Math.min(Math.max(takeParam, 1), 100)
      : 25;

    const rows = await prisma.purchaseInvoice.findMany({
      where: {
        businessId: business.id,
        ...(status ? { status: status as never } : {}),
        ...(await purchaseInvoiceScopeWhere("view")),
        ...(search
          ? {
              OR: [
                { vendorInvoiceNumber: { contains: search, mode: "insensitive" } },
                { vendor: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { vendor: { select: { id: true, name: true } } },
      skip,
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const purchaseInvoices = hasMore ? rows.slice(0, take) : rows;

    return NextResponse.json({ purchaseInvoices, hasMore });
  } catch (error) {
    return errorResponse(error);
  }
}

// Accepts vendorId alone (the builder UI's own "empty draft, then PATCH
// content in" flow — design doc §5, same shape as POST /api/documents)
// OR the full payload — vendor's own invoice number/date, shipment
// details, line items — in one call. Both are valid: a caller creating
// a complete record doesn't have to know about a two-step choreography
// just to avoid every field beyond vendorId being silently dropped
// (purchaseInvoiceCreateSchema now accepts everything
// purchaseInvoiceUpdateSchema does, vendorId made required).
export async function POST(request: NextRequest) {
  try {
    const { business, user } = await requireBusiness();
    await requirePermission("purchase_invoices.create");
    const input = purchaseInvoiceCreateSchema.parse(await request.json());

    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, businessId: business.id },
    });
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
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

    const rounding = totals
      ? applyRounding(
          Number(totals.taxableAmount.plus(totals.cgst).plus(totals.sgst).plus(totals.igst)),
          input.roundTotal ?? false,
        )
      : undefined;

    const exchangeRate = input.exchangeRate ?? null;

    const purchaseInvoice = await prisma.purchaseInvoice.create({
      data: {
        businessId: business.id,
        vendorId: vendor.id,
        vendorInvoiceNumber: contentFields.vendorInvoiceNumber ?? "",
        vendorInvoiceDate: contentFields.vendorInvoiceDate ?? todayInIST(),
        createdByUserId: user.id,
        vendorSnapshot: buildVendorSnapshot(vendor),
        businessSnapshot: buildBusinessSnapshot(business),
        ...contentFields,
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
        ...(lineItems && lineItems.length > 0
          ? {
              lineItems: {
                create: lineItems.map((item, index) => {
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

                  return {
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
                  };
                }),
              },
            }
          : {}),
      },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });

    return NextResponse.json({ purchaseInvoice }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
