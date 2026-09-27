import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/permissions";
import { vendorUpdateSchema } from "@/lib/validation/vendor";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requirePermission("vendors.view");
    const { id } = await params;

    // Scoped by businessId, not just id — a vendor id from another
    // tenant must 404, not leak a "found, but forbidden" distinction.
    const vendor = await prisma.vendor.findFirst({
      where: { id, businessId: business.id },
    });
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    return NextResponse.json({ vendor });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requirePermission("vendors.edit");
    const { id } = await params;

    const existing = await prisma.vendor.findFirst({
      where: { id, businessId: business.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const input = vendorUpdateSchema.parse(await request.json());
    const vendor = await prisma.vendor.update({
      where: { id },
      data: input,
    });

    return NextResponse.json({ vendor });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requirePermission("vendors.delete");
    const { id } = await params;

    const existing = await prisma.vendor.findFirst({
      where: { id, businessId: business.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    // Hard delete — no FK restricts this yet (PurchaseInvoice.vendorId
    // doesn't exist until Stage b, see docs/accounts-payable-phase1-
    // design.md §1.1/§10a). Once it does, a vendor with invoices will
    // fail this with a P2003 the caller should handle via deactivation
    // (isActive) instead.
    await prisma.vendor.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
