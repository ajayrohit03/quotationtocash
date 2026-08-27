import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";

// A deactivated BusinessMember (see docs/hierarchy-access-control-design.md
// §5, the departing-member offboarding path) must lose access on their very
// next request, not just stop showing up in some UI list. requireBusiness()
// and requireBusinessMembership() are the two places that resolve "is this
// person currently a member" for every authenticated request and for any
// businessId-scoped check respectively — both must actually filter on
// isActive, not just read it for display. Real DB, only the Clerk/Next
// request-context seam mocked (same pattern as require-business-owner.test.ts).
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

async function createMember(isActive: boolean) {
  const clerkUserId = `user_deactivated_test_${randomUUID()}`;
  const business = await prisma.business.create({
    data: {
      name: `Deactivated Test Business ${randomUUID()}`,
      slug: `deactivated-test-${randomUUID()}`,
      email: `deactivated-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const user = await prisma.user.create({
    data: {
      email: `deactivated-test-user-${randomUUID()}@example.invalid`,
      authProviderId: clerkUserId,
      name: "Deactivated Test User",
    },
  });
  createdUserIds.push(user.id);

  const membership = await prisma.businessMember.create({
    data: { businessId: business.id, userId: user.id, role: "staff", isActive },
  });

  return { clerkUserId, business, user, membership };
}

async function mockedAuthAs(clerkUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as never);
}

describe("deactivated BusinessMember — access is revoked immediately", () => {
  it("requireBusiness() throws NoBusinessError once isActive is false", async () => {
    const { clerkUserId } = await createMember(false);
    await mockedAuthAs(clerkUserId);

    const { requireBusiness } = await import("@/lib/auth/session");
    const { NoBusinessError } = await import("@/lib/auth/errors");
    await expect(requireBusiness()).rejects.toThrow(NoBusinessError);
  });

  it("requireBusiness() succeeds for the same person while isActive is true", async () => {
    const { clerkUserId, business } = await createMember(true);
    await mockedAuthAs(clerkUserId);

    const { requireBusiness } = await import("@/lib/auth/session");
    const result = await requireBusiness();
    expect(result.business.id).toBe(business.id);
  });

  it("requireBusinessMembership() throws ForbiddenError once isActive is false", async () => {
    const { clerkUserId, business } = await createMember(false);
    await mockedAuthAs(clerkUserId);

    const { requireBusinessMembership } = await import("@/lib/auth/session");
    const { ForbiddenError } = await import("@/lib/auth/errors");
    await expect(requireBusinessMembership(business.id)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("requireBusinessMembership() succeeds for the same person while isActive is true", async () => {
    const { clerkUserId, business, membership } = await createMember(true);
    await mockedAuthAs(clerkUserId);

    const { requireBusinessMembership } = await import("@/lib/auth/session");
    const result = await requireBusinessMembership(business.id);
    expect(result.id).toBe(membership.id);
  });
});
