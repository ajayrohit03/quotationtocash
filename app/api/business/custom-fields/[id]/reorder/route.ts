import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/permissions";
import { customFieldDefinitionReorderSchema } from "@/lib/validation/custom-fields";

// Swaps sortOrder with the adjacent *active* definition of the same
// scope — archived definitions keep whatever position they were
// archived at and never participate in reordering. Already-at-the-edge
// (no neighbor to swap with) is a no-op, not an error: the up/down
// button for the first/last row is simply disabled client-side, but
// this guards the same case server-side rather than trusting that.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requirePermission("organization.manage");
    const { id } = await params;
    const { direction } = customFieldDefinitionReorderSchema.parse(
      await request.json(),
    );

    const current = await prisma.customFieldDefinition.findFirst({
      where: { id, businessId: business.id },
    });
    if (!current) {
      return NextResponse.json({ error: "Custom field not found" }, { status: 404 });
    }

    const neighbor = await prisma.customFieldDefinition.findFirst({
      where: {
        businessId: business.id,
        scope: current.scope,
        isActive: true,
        sortOrder:
          direction === "up"
            ? { lt: current.sortOrder }
            : { gt: current.sortOrder },
      },
      orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });

    if (neighbor) {
      await prisma.$transaction([
        prisma.customFieldDefinition.update({
          where: { id: current.id },
          data: { sortOrder: neighbor.sortOrder },
        }),
        prisma.customFieldDefinition.update({
          where: { id: neighbor.id },
          data: { sortOrder: current.sortOrder },
        }),
      ]);
    }

    const definitions = await prisma.customFieldDefinition.findMany({
      where: { businessId: business.id },
      orderBy: [{ scope: "asc" }, { sortOrder: "asc" }],
    });

    return NextResponse.json({ definitions });
  } catch (error) {
    return errorResponse(error);
  }
}
