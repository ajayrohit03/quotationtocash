import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";

vi.mock("server-only", () => ({}));

const createdBucketKeys: string[] = [];

afterEach(async () => {
  if (createdBucketKeys.length > 0) {
    await prisma.rateLimitHit.deleteMany({
      where: { bucketKey: { in: createdBucketKeys } },
    });
    createdBucketKeys.length = 0;
  }
});

describe("checkRateLimit — real DB fixed-window counter", () => {
  it("allows requests up to the limit, then blocks within the same window", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    const bucketKey = `test:${randomUUID()}`;
    createdBucketKeys.push(bucketKey);

    const first = await checkRateLimit(bucketKey, 60_000, 2);
    const second = await checkRateLimit(bucketKey, 60_000, 2);
    const third = await checkRateLimit(bucketKey, 60_000, 2);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
  });

  it("keeps separate buckets independent", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    const bucketA = `test:${randomUUID()}`;
    const bucketB = `test:${randomUUID()}`;
    createdBucketKeys.push(bucketA, bucketB);

    await checkRateLimit(bucketA, 60_000, 1);
    const blockedA = await checkRateLimit(bucketA, 60_000, 1);
    const allowedB = await checkRateLimit(bucketB, 60_000, 1);

    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });
});
