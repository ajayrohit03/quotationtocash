import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/permissions";
import { vendorCreateSchema } from "@/lib/validation/vendor";

export async function GET(request: NextRequest) {
  try {
    const { business } = await requirePermission("vendors.view");
    const search = request.nextUrl.searchParams.get("q")?.trim();

    const vendors = await prisma.vendor.findMany({
      where: {
        businessId: business.id,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { gstin: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ vendors });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { business } = await requirePermission("vendors.create");
    const input = vendorCreateSchema.parse(await request.json());

    const vendor = await prisma.vendor.create({
      data: { businessId: business.id, ...input },
    });

    return NextResponse.json({ vendor }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
