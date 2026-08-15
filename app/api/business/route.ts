import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import {
  ACTIVE_BUSINESS_COOKIE,
  requireAuth,
  requireBusiness,
  requireBusinessOwner,
} from "@/lib/auth/session";
import {
  businessCreateSchema,
  businessUpdateSchema,
} from "@/lib/validation/business";

// Creates a new business owned by the current user. A user can own or
// belong to more than one business, so this does not check for an
// existing membership first.
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth();
    const input = businessCreateSchema.parse(await request.json());

    const business = await prisma.$transaction(async (tx) => {
      const created = await tx.business.create({ data: input });
      await tx.businessMember.create({
        data: { businessId: created.id, userId: user.id, role: "owner" },
      });
      return created;
    });

    const response = NextResponse.json({ business }, { status: 201 });
    response.cookies.set(ACTIVE_BUSINESS_COOKIE, business.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() {
  try {
    const { business, membership } = await requireBusiness();
    return NextResponse.json({ business, role: membership.role });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { business } = await requireBusinessOwner();
    const input = businessUpdateSchema.parse(await request.json());

    const updated = await prisma.business.update({
      where: { id: business.id },
      data: input,
    });

    return NextResponse.json({ business: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
