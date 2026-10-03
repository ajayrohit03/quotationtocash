import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin/session";

export class AdminAuthError extends Error {
  constructor(public readonly status: 401 | 403 | 429) {
    super(status === 429 ? "Too many requests" : status === 403 ? "Forbidden" : "Unauthorized");
  }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest();

// Fails closed: an unset/too-short ADMIN_PASSWORD matches nothing.
export function passwordMatches(candidate: string): boolean {
  let expected: string;
  try {
    expected = env.ADMIN_PASSWORD;
  } catch {
    console.error("ADMIN_PASSWORD is unset or invalid; rejecting admin request");
    return false;
  }
  return timingSafeEqual(sha256(candidate), sha256(expected));
}

// Per-IP limit on credential guesses — checked before any password
// comparison. A request with a valid session cookie never needs it.
export async function enforceAdminRateLimit(request: NextRequest): Promise<void> {
  const { allowed } = await checkRateLimit(`admin:${getClientIp(request)}`, 60_000, 20);
  if (!allowed) throw new AdminAuthError(429);
}

// Cookie-authenticated mutations must come from the admin site itself:
// SameSite=Strict already blocks cross-site sends; this is the backstop.
function enforceSameOrigin(request: NextRequest): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null;
  }
  if (!originHost || !host || originHost !== host) throw new AdminAuthError(403);
}

// First thing in every /api/admin/* handler (except auth/verify, which
// authenticates by password itself). Accepts a valid admin_session cookie
// (the admin UI) OR "Authorization: Bearer <ADMIN_PASSWORD>" (scripts).
// Every failure to authenticate is the same 401.
export async function requireAdmin(request: NextRequest): Promise<void> {
  const cookie = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (cookie && verifyAdminSessionToken(cookie)) {
    enforceSameOrigin(request);
    return;
  }

  await enforceAdminRateLimit(request);

  const match = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "");
  if (!match || !passwordMatches(match[1])) throw new AdminAuthError(401);
}

// For admin server components/pages (no NextRequest available).
export async function isAdminSession(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  return !!token && verifyAdminSessionToken(token);
}
