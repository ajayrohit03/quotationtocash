import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { jobCreateSchema } from "@/lib/validation/job";
import { getJobsPnlSummaries } from "@/lib/jobs/aggregates";

export async function GET(request: NextRequest) {
  try {
    const { business } = await requireBusiness();
    await requirePermission("jobs.view");
    const search = request.nextUrl.searchParams.get("q")?.trim();

    const jobs = await prisma.job.findMany({
      where: {
        businessId: business.id,
        ...(search
          ? {
              OR: [
                { jobRef: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    const summaries = await getJobsPnlSummaries(
      business.id,
      jobs.map((j) => j.id),
    );

    return NextResponse.json({
      jobs: jobs.map((job) => ({ ...job, ...summaries.get(job.id) })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { business, user } = await requireBusiness();
    await requirePermission("jobs.create");
    const input = jobCreateSchema.parse(await request.json());

    const job = await prisma.job.create({
      data: {
        businessId: business.id,
        jobRef: input.jobRef,
        description: input.description ?? null,
        createdByUserId: user.id,
      },
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
