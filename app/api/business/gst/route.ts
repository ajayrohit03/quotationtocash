import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusinessOwner } from "@/lib/auth/session";
import { gstSetupSchema } from "@/lib/validation/business";

// Separate from the general PATCH /api/business: GST fields have
// cross-field rules a plain partial update can't express (GSTIN/rate/
// place/registration required together; disabling GST clears them all
// rather than leaving stale values behind).
export async function PATCH(request: NextRequest) {
  try {
    const { business } = await requireBusinessOwner();
    const input = gstSetupSchema.parse(await request.json());

    const updated = await prisma.business.update({
      where: { id: business.id },
      data: input.gstEnabled
        ? {
            gstEnabled: true,
            gstin: input.gstin,
            gstDefaultRate: input.gstDefaultRate,
            placeOfSupply: input.placeOfSupply,
            registrationType: input.registrationType,
          }
        : {
            gstEnabled: false,
            gstin: null,
            gstDefaultRate: null,
            placeOfSupply: null,
            registrationType: null,
          },
    });

    return NextResponse.json({ business: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
