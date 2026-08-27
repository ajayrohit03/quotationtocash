import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";

// requireBusinessAdmin() must accept Owner and Admin alike (Owner's
// permissions are a strict superset of Admin's) and reject Staff — this
// is the exact bug class flagged during design review: an admin-tier gate
// written as an exact `role === "admin"` match would silently lock the
// Owner out. Real DB, only the Clerk/Next request-context seam mocked
// (same pattern as require-business-owner.test.ts).
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

const createdBusinessIds: string[] = [];
const createdUserIds: string[] = [];

afterEach(async () => {
  if (createdBusinessIds.length > 0) {
    await prisma.business.deleteMany({
      where: { id: { in: createdBusinessIds } },
    });
    createdBusinessIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
  vi.resetModules();
});

async function createBusinessWithMember(role: "owner" | "admin" | "staff") {
  const clerkUserId = `user_admin_test_${randomUUID()}`;
  const business = await prisma.business.create({
    data: {
      name: `Admin Test Business ${randomUUID()}`,
      slug: `admin-test-${randomUUID()}`,
      email: `admin-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const user = await prisma.user.create({
    data: {
      email: `admin-test-user-${randomUUID()}@example.invalid`,
      authProviderId: clerkUserId,
      name: "Admin Test User",
    },
  });
  createdUserIds.push(user.id);

  await prisma.businessMember.create({
    data: { businessId: business.id, userId: user.id, role },
  });

  return { clerkUserId, business };
}

async function mockedAuthAs(clerkUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as never);
}

describe("requireBusinessAdmin — real DB", () => {
  it("does not throw for a genuine owner-role membership", async () => {
    const { clerkUserId, business } = await createBusinessWithMember("owner");
    await mockedAuthAs(clerkUserId);

    const { requireBusinessAdmin } = await import("@/lib/auth/session");
    const result = await requireBusinessAdmin();
    expect(result.business.id).toBe(business.id);
  });

  it("does not throw for a genuine admin-role membership", async () => {
    const { clerkUserId, business } = await createBusinessWithMember("admin");
    await mockedAuthAs(clerkUserId);

    const { requireBusinessAdmin } = await import("@/lib/auth/session");
    const result = await requireBusinessAdmin();
    expect(result.business.id).toBe(business.id);
  });

  it("throws ForbiddenError for a genuine staff-role membership", async () => {
    const { clerkUserId } = await createBusinessWithMember("staff");
    await mockedAuthAs(clerkUserId);

    const { requireBusinessAdmin } = await import("@/lib/auth/session");
    const { ForbiddenError } = await import("@/lib/auth/errors");
    await expect(requireBusinessAdmin()).rejects.toThrow(ForbiddenError);
  });
});
