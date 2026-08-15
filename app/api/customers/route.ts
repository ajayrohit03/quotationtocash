import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { customerCreateSchema } from "@/lib/validation/customer";
import { getCustomersBillingSummaries } from "@/lib/documents/aggregates";

export async function GET(request: NextRequest) {
  try {
    const { business } = await requireBusiness();
    const search = request.nextUrl.searchParams.get("q")?.trim();

    const customers = await prisma.customer.findMany({
      where: {
        businessId: business.id,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { company: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    const summaries = await getCustomersBillingSummaries(
      business.id,
      customers.map((c) => c.id),
    );

    return NextResponse.json({
      customers: customers.map((customer) => ({
        ...customer,
        ...summaries.get(customer.id),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { business } = await requireBusiness();
    const input = customerCreateSchema.parse(await request.json());

    const customer = await prisma.customer.create({
      data: { businessId: business.id, ...input },
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
