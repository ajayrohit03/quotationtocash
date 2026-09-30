import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { jobUpdateSchema } from "@/lib/validation/job";
import { getJobPnlSummary } from "@/lib/jobs/aggregates";
import { documentScopeWhere } from "@/lib/documents/visibility";
import { purchaseInvoiceScopeWhere } from "@/lib/purchase-invoices/visibility";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusiness();
    await requirePermission("jobs.view");
    const { id } = await params;

    const job = await prisma.job.findFirst({
      where: { id, businessId: business.id },
    });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const [documents, purchaseInvoices, summary] = await Promise.all([
      prisma.document.findMany({
        where: { businessId: business.id, jobId: id, ...(await documentScopeWhere("view")) },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          number: true,
          status: true,
          issueDate: true,
          total: true,
          currency: true,
          customer: { select: { id: true, name: true } },
        },
      }),
      prisma.purchaseInvoice.findMany({
        where: {
          businessId: business.id,
          jobId: id,
          ...(await purchaseInvoiceScopeWhere("view")),
        },
        orderBy: { createdAt: "desc" },
        include: { vendor: { select: { id: true, name: true } } },
      }),
      getJobPnlSummary(business.id, id),
    ]);

    return NextResponse.json({
      job: { ...job, ...summary },
      documents,
      purchaseInvoices,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusiness();
    await requirePermission("jobs.edit");
    const { id } = await params;

    const existing = await prisma.job.findFirst({
      where: { id, businessId: business.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const input = jobUpdateSchema.parse(await request.json());
    const job = await prisma.job.update({
      where: { id },
      data: input,
    });

    return NextResponse.json({ job });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusiness();
    await requirePermission("jobs.delete");
    const { id } = await params;

    const existing = await prisma.job.findFirst({
      where: { id, businessId: business.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Hard delete — jobId on Document/PurchaseInvoice is onDelete:
    // SetNull (design doc §1.2), so deleting a job never fails or
    // cascades; every linked document/purchase invoice simply becomes
    // unlinked.
    await prisma.job.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
