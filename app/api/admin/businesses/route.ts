import { NextResponse, type NextRequest } from "next/server";
import { AdminAuthError, requireAdmin } from "@/lib/admin/auth";
import { listBusinessesWithStats } from "@/lib/admin/queries";
import { errorResponse } from "@/lib/api/respond";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const businesses = await listBusinessesWithStats(request.nextUrl.searchParams.get("q") ?? undefined);
    return NextResponse.json({ businesses });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return errorResponse(error);
  }
}
