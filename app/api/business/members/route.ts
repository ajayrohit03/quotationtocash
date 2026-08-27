import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusinessAdmin } from "@/lib/auth/session";

// Adding a member is now exclusively through an accepted invitation (see
// docs/invitation-onboarding-design.md) — the old "add by email, requires
// they've already signed in once" POST that used to live here is retired;
// it's strictly superseded (invitations handle both existing- and
// new-user cases, plus a real ownership check via email match).
export async function GET() {
  try {
    const { business } = await requireBusinessAdmin();

    const members = await prisma.businessMember.findMany({
      where: { businessId: business.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ members });
  } catch (error) {
    return errorResponse(error);
  }
}
