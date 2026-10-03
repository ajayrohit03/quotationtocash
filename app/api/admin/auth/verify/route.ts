import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AdminAuthError, enforceAdminRateLimit, passwordMatches } from "@/lib/admin/auth";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
  createAdminSessionToken,
} from "@/lib/admin/session";
import { errorResponse } from "@/lib/api/respond";

const bodySchema = z.object({ password: z.string().min(1).max(500) }).strict();

// Trades the admin password for a signed 24h httpOnly session cookie.
// Same password check and per-IP rate limit as the Bearer path.
export async function POST(request: NextRequest) {
  try {
    await enforceAdminRateLimit(request);
    const { password } = bodySchema.parse(await request.json().catch(() => null));
    if (!passwordMatches(password)) throw new AdminAuthError(401);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_MS / 1000,
    });
    return response;
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return errorResponse(error);
  }
}
