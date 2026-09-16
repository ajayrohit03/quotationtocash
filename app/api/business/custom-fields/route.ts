import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/permissions";
import { customFieldDefinitionCreateSchema } from "@/lib/validation/custom-fields";

// Returns every definition, active and archived — the Settings tab
// itself decides how to display each (§3: archived stays listed with a
// reactivate control, never hidden entirely, since it's a soft-delete).
export async function GET() {
  try {
    const { business } = await requirePermission("organization.manage");

    const definitions = await prisma.customFieldDefinition.findMany({
      where: { businessId: business.id },
      orderBy: [{ scope: "asc" }, { sortOrder: "asc" }],
    });

    return NextResponse.json({ definitions });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { business } = await requirePermission("organization.manage");
    const input = customFieldDefinitionCreateSchema.parse(await request.json());

    // New definitions land after every existing one of the same scope —
    // simple append-at-end, matching how sortOrder is used everywhere
    // else in this app (no gaps to fill, no drag-and-drop renumbering).
    const last = await prisma.customFieldDefinition.findFirst({
      where: { businessId: business.id, scope: input.scope },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const definition = await prisma.customFieldDefinition.create({
      data: {
        businessId: business.id,
        ...input,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json({ definition }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
