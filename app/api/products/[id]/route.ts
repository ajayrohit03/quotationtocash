import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/permissions";
import { productUpdateSchema } from "@/lib/validation/product";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requirePermission("products.edit");
    const { id } = await params;

    const existing = await prisma.product.findFirst({
      where: { id, businessId: business.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const input = productUpdateSchema.parse(await request.json());
    const product = await prisma.product.update({
      where: { id },
      data: input,
    });

    return NextResponse.json({ product });
  } catch (error) {
    return errorResponse(error);
  }
}
