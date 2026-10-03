import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { AdminAuthError, requireAdmin } from "@/lib/admin/auth";
import { FEATURE_KEYS, PLANS } from "@/lib/plans/catalog";

const planUpdateSchema = z
  .object({
    plan: z.enum(PLANS),
    note: z.string().trim().max(1000).nullable().optional(),
    planOverrides: z
      .partialRecord(z.enum(FEATURE_KEYS as [string, ...string[]]), z.boolean())
      .nullable()
      .optional(),
    updatedBy: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

// Authenticated by ADMIN_PASSWORD, not Clerk — proxy.ts excludes
// /api/admin/* entirely. Note/overrides omitted = leave unchanged;
// planOverrides null = clear.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // TEMPORARY DIAGNOSTIC — remove after diagnosis. Logs lengths and
  // match booleans only, never any characters of the secret or token.
  const diagToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  const diagEnv = process.env.ADMIN_PASSWORD ?? "";
  console.log(
    "ADMIN_PASSWORD set:", !!process.env.ADMIN_PASSWORD,
    "env length:", diagEnv.length,
    "token length:", diagToken.length,
    "first3 match:", diagEnv.length > 0 && diagEnv.slice(0, 3) === diagToken.slice(0, 3),
    "token has edge whitespace:", diagToken !== diagToken.trim(),
    "exact match:", diagEnv.length > 0 && diagEnv === diagToken,
  );
  try {
    await requireAdmin(request);
    const { id } = await params;
    const input = planUpdateSchema.parse(await request.json().catch(() => null));

    const business = await prisma.business.update({
      where: { id },
      data: {
        plan: input.plan,
        planUpdatedAt: new Date(),
        planUpdatedByUserId: input.updatedBy ?? null,
        ...(input.note !== undefined && { planNote: input.note }),
        ...(input.planOverrides !== undefined && {
          planOverrides: input.planOverrides ?? Prisma.DbNull,
        }),
      },
      select: {
        id: true,
        plan: true,
        planOverrides: true,
        planNote: true,
        planUpdatedAt: true,
        planUpdatedByUserId: true,
      },
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
