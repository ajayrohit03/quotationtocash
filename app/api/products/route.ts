import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/permissions";
import { productCreateSchema } from "@/lib/validation/product";

export async function GET(request: NextRequest) {
  try {
    const { business } = await requirePermission("products.view");
    const search = request.nextUrl.searchParams.get("q")?.trim();

    const products = await prisma.product.findMany({
      where: {
        businessId: business.id,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ products });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { business } = await requirePermission("products.create");
    const input = productCreateSchema.parse(await request.json());

    const product = await prisma.product.create({
      data: { businessId: business.id, ...input },
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
