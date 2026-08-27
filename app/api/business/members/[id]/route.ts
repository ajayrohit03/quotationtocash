import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusinessAdmin } from "@/lib/auth/session";
import { memberUpdateSchema } from "@/lib/validation/member";
import { wouldCreateCycle } from "@/lib/business/hierarchy";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusinessAdmin();
    const { id } = await params;
    const input = memberUpdateSchema.parse(await request.json());

    const existing = await prisma.businessMember.findFirst({
      where: { id, businessId: business.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    // The owner's own membership carries no hierarchy meaning (owner
    // already sees everything, unconditionally) and isn't editable
    // through this endpoint — there is exactly one Owner, and role
    // transfer isn't a feature this route supports.
    if (existing.role === "owner") {
      return NextResponse.json(
        { error: "The owner's membership can't be edited here." },
        { status: 400 },
      );
    }

    if (input.reportsToId !== undefined && input.reportsToId !== null) {
      // Admin, not just Staff, is a valid manager target — an Admin can
      // be someone's real line manager in the org chart even though the
      // Admin's *own* document visibility is unconditional and doesn't
      // depend on this tree at all (see
      // docs/invitation-onboarding-design.md §1.3).
      const manager = await prisma.businessMember.findFirst({
        where: {
          id: input.reportsToId,
          businessId: business.id,
          role: { in: ["staff", "admin"] },
        },
      });
      if (!manager || !manager.isActive) {
        return NextResponse.json(
          { error: "That manager isn't a valid, active staff or admin member of this business." },
          { status: 400 },
        );
      }

      const members = await prisma.businessMember.findMany({
        where: { businessId: business.id },
        select: { id: true, userId: true, reportsToId: true },
      });
      if (wouldCreateCycle(members, id, input.reportsToId)) {
        return NextResponse.json(
          { error: "That would create a reporting cycle." },
          { status: 400 },
        );
      }
    }

    const member = await prisma.businessMember.update({
      where: { id },
      data: {
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.reportsToId !== undefined
          ? { reportsToId: input.reportsToId }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({ member });
  } catch (error) {
    return errorResponse(error);
  }
}
