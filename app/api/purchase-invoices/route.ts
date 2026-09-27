import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { todayInIST } from "@/lib/dates";
import { purchaseInvoiceCreateSchema } from "@/lib/validation/purchase-invoice";
import { buildBusinessSnapshot } from "@/lib/documents/snapshots";
import { buildVendorSnapshot } from "@/lib/purchase-invoices/snapshots";
import { purchaseInvoiceScopeWhere } from "@/lib/purchase-invoices/visibility";

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

// Creates an empty received invoice: just a vendor. Everything else
// (vendor's own invoice number/date, shipment details, line items) is
// filled in via PATCH as the builder autosaves — same "empty draft,
// then PATCH content in" shape as POST /api/documents (design doc §5).
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

    const purchaseInvoice = await prisma.purchaseInvoice.create({
      data: {
        businessId: business.id,
        vendorId: vendor.id,
        vendorInvoiceNumber: "",
        vendorInvoiceDate: todayInIST(),
        createdByUserId: user.id,
        vendorSnapshot: buildVendorSnapshot(vendor),
        businessSnapshot: buildBusinessSnapshot(business),
      },
    });

    return NextResponse.json({ purchaseInvoice }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
