import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { requireCancellablePurchaseInvoice } from "@/lib/purchase-invoices/status";
import { purchaseInvoiceScopeWhere } from "@/lib/purchase-invoices/visibility";

// received/approved -> cancelled — a dead end, same purchase_invoices.edit
// tier as ordinary content edits (mirrors how Document's own "cancelled"
// is just a manually-settable status under invoices.edit, not gated any
// tighter — see docs/accounts-payable-phase1-design.md §2).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusiness();
    await requirePermission("purchase_invoices.edit");
    const { id } = await params;

    const existing = await prisma.purchaseInvoice.findFirst({
      where: { id, businessId: business.id, ...(await purchaseInvoiceScopeWhere("mutate")) },
    });
    if (!existing) {
      return NextResponse.json({ error: "Purchase invoice not found" }, { status: 404 });
    }
    requireCancellablePurchaseInvoice(existing.status);

    const purchaseInvoice = await prisma.purchaseInvoice.update({
      where: { id },
      data: { status: "cancelled" },
    });

    return NextResponse.json({ purchaseInvoice });
  } catch (error) {
    return errorResponse(error);
  }
}
