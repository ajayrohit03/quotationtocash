import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/permissions";
import { customFieldDefinitionUpdateSchema } from "@/lib/validation/custom-fields";

// Also how "archive"/"reactivate" work — both are just PATCH
// { isActive }, no separate endpoint, same as every other soft-delete
// toggle in this app (BusinessMember.isActive).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requirePermission("organization.manage");
    const { id } = await params;

    const existing = await prisma.customFieldDefinition.findFirst({
      where: { id, businessId: business.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Custom field not found" }, { status: 404 });
    }

    const input = customFieldDefinitionUpdateSchema.parse(await request.json());
    const definition = await prisma.customFieldDefinition.update({
      where: { id },
      data: input,
    });

    return NextResponse.json({ definition });
  } catch (error) {
    return errorResponse(error);
  }
}
