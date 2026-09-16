import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusinessOwner } from "@/lib/auth/session";
import { businessIdentitySchema } from "@/lib/validation/business";

// Owner-only, same tier as GST (see gst/route.ts) — kept independent of
// gstSetupSchema/gstEnabled, see businessIdentitySchema's own comment.
export async function PATCH(request: NextRequest) {
  try {
    const { business } = await requireBusinessOwner();
    const input = businessIdentitySchema.parse(await request.json());

    const updated = await prisma.business.update({
      where: { id: business.id },
      data: input,
    });

    return NextResponse.json({ business: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
