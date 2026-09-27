import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { requireApprovablePurchaseInvoice } from "@/lib/purchase-invoices/status";
import { purchaseInvoiceScopeWhere } from "@/lib/purchase-invoices/visibility";

// received -> approved. Owner/admin only (purchase_invoices.pay) — the
// financial control point this whole status flow exists to create; see
// docs/accounts-payable-phase1-design.md §8's explicit reasoning for
// reusing that same tier here rather than purchase_invoices.edit.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusiness();
    await requirePermission("purchase_invoices.pay");
    const { id } = await params;

    const existing = await prisma.purchaseInvoice.findFirst({
      where: { id, businessId: business.id, ...(await purchaseInvoiceScopeWhere("mutate")) },
    });
    if (!existing) {
      return NextResponse.json({ error: "Purchase invoice not found" }, { status: 404 });
    }
    requireApprovablePurchaseInvoice(existing.status);

    const purchaseInvoice = await prisma.purchaseInvoice.update({
      where: { id },
      data: { status: "approved" },
    });

    return NextResponse.json({ purchaseInvoice });
  } catch (error) {
    return errorResponse(error);
  }
}
