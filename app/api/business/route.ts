import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import {
  ACTIVE_BUSINESS_COOKIE,
  requireAuth,
  requireBusiness,
  requireBusinessAdmin,
} from "@/lib/auth/session";
import {
  businessCreateSchema,
  businessUpdateSchema,
} from "@/lib/validation/business";
import { generateUniqueSlug } from "@/lib/business/slug";

// Creates a new business owned by the current user. A user can own or
// belong to more than one business, so this does not check for an
// existing membership first.
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth();
    const input = businessCreateSchema.parse(await request.json());

    const business = await prisma.$transaction(async (tx) => {
      // Auto-generated, never a client-supplied field — see
      // docs/public-share-subdomains-design.md §1. Checked inside the
      // same transaction as the insert; check-then-use is proportionate
      // here (one user creating one business, not a genuine multi-request
      // race), and the column's own @unique constraint is still the real
      // backstop if that assumption is ever wrong.
      const slug = await generateUniqueSlug(input.name, async (candidate) => {
        const existing = await tx.business.findUnique({
          where: { slug: candidate },
          select: { id: true },
        });
        return existing !== null;
      });

      const created = await tx.business.create({ data: { ...input, slug } });
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

// Business profile / Documents / Appearance tabs all PATCH here — all
// three are Admin-delegable per docs/invitation-onboarding-design.md
// §1.2 (operational/branding config, no compliance or financial weight).
// GST stays owner-only on its own route (see gst/route.ts).
export async function PATCH(request: NextRequest) {
  try {
    const { business } = await requireBusinessAdmin();
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
