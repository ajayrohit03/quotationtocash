import "server-only";

import { prisma } from "@/lib/db/prisma";

// Postgres-backed fixed-window counter — this stack has no Redis/cache
// layer, and an in-memory counter wouldn't survive a multi-instance or
// serverless deployment. (bucketKey, windowStart) is upserted atomically
// via Postgres's native INSERT ... ON CONFLICT, so concurrent requests in
// the same window can't under-count each other. See
// docs/invitation-onboarding-design.md §6.2.
export async function checkRateLimit(
  bucketKey: string,
  windowMs: number,
  limit: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const hit = await prisma.rateLimitHit.upsert({
    where: { bucketKey_windowStart: { bucketKey, windowStart } },
    create: { bucketKey, windowStart },
    update: { count: { increment: 1 } },
  });

  return { allowed: hit.count <= limit, remaining: Math.max(0, limit - hit.count) };
}
