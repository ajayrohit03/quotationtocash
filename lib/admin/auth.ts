import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

export class AdminAuthError extends Error {
  constructor(public readonly status: 401 | 429) {
    super(status === 429 ? "Too many requests" : "Unauthorized");
  }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest();

// Called first thing in every /api/admin/* handler, before the body is
// parsed or Prisma is touched. Fails closed: an unset/too-short
// ADMIN_PASSWORD rejects every request. Missing header, wrong scheme,
// wrong password, and "not configured" all produce the same 401, so the
// response never reveals configuration state. Rate-limited per IP before
// the comparison so the shared secret can't be brute-forced.
export async function requireAdmin(request: NextRequest): Promise<void> {
  const { allowed } = await checkRateLimit(`admin:${getClientIp(request)}`, 60_000, 20);
  if (!allowed) throw new AdminAuthError(429);

  let expected: string;
  try {
    expected = env.ADMIN_PASSWORD;
  } catch {
    console.error("ADMIN_PASSWORD is unset or invalid; rejecting admin request");
    throw new AdminAuthError(401);
  }

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match || !timingSafeEqual(sha256(match[1]), sha256(expected))) {
    throw new AdminAuthError(401);
  }
}
