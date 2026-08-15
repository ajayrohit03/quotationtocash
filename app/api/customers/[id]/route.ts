import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { customerUpdateSchema } from "@/lib/validation/customer";
import { getCustomerBillingSummary } from "@/lib/documents/aggregates";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusiness();
    const { id } = await params;

    // Scoped by businessId, not just id — a customer id from another
    // tenant must 404, not leak a "found, but forbidden" distinction.
    const customer = await prisma.customer.findFirst({
      where: { id, businessId: business.id },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const [documents, summary] = await Promise.all([
      prisma.document.findMany({
        where: { businessId: business.id, customerId: id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          number: true,
          status: true,
          issueDate: true,
          dueDate: true,
          validUntil: true,
          total: true,
        },
      }),
      getCustomerBillingSummary(business.id, id),
    ]);

    return NextResponse.json({
      customer: { ...customer, ...summary },
      documents,
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
    const { id } = await params;

    const existing = await prisma.customer.findFirst({
      where: { id, businessId: business.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const input = customerUpdateSchema.parse(await request.json());
    const customer = await prisma.customer.update({
      where: { id },
      data: input,
    });

    return NextResponse.json({ customer });
  } catch (error) {
    return errorResponse(error);
  }
}
