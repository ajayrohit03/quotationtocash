import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { AdminAuthError, requireAdmin } from "@/lib/admin/auth";

const bodySchema = z.object({ isInternal: z.boolean() }).strict();

// Internal businesses are excluded from every analytics query
// (lib/analytics/queries.ts). Same admin auth as the plan route.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const { isInternal } = bodySchema.parse(await request.json().catch(() => null));
    const business = await prisma.business.update({
      where: { id },
      data: { isInternal },
      select: { id: true, isInternal: true },
    });
    return NextResponse.json(business);
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if ((error as { code?: string })?.code === "P2025") {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }
    return errorResponse(error);
  }
}
