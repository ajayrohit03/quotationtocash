import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusinessOwner } from "@/lib/auth/session";
import { einvoicingSchema } from "@/lib/validation/business";

// Owner-only, same tier as GST/identity (see gst/route.ts,
// identity/route.ts) — these are IRP API credentials, not just display
// text. Scaffolding only: nothing anywhere in this app makes a real IRP
// call yet (see lib/einvoice/buildIrpPayload.ts's own comment) — this
// route just stores what Settings > E-invoicing collects.
export async function PATCH(request: NextRequest) {
  try {
    const { business } = await requireBusinessOwner();
    const input = einvoicingSchema.parse(await request.json());

    const updated = await prisma.business.update({
      where: { id: business.id },
      data: input,
    });

    return NextResponse.json({ business: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
