import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusinessAdmin } from "@/lib/auth/session";

// The server sets the timestamp — never trust a client-supplied datetime
// for this. Idempotent: finishing (or re-finishing) the wizard just marks
// "now" again, no harm if called twice. Admin-delegable — one-time
// operational bookkeeping with no financial/legal weight, per
// docs/permission-layer-design.md §1 Finding B.
export async function POST() {
  try {
    const { business } = await requireBusinessAdmin();

    const updated = await prisma.business.update({
      where: { id: business.id },
      data: { onboardingCompletedAt: new Date() },
    });

    return NextResponse.json({ business: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
