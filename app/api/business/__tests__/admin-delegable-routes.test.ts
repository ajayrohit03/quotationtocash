import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Finding B (docs/permission-layer-design.md §1): logo upload/remove and
// complete-onboarding were still hardcoded to requireBusinessOwner()
// despite the UI already showing them as enabled for an Admin — a button
// that looked clickable but 403'd. This proves the fix: an Admin request
// no longer gets rejected by the auth gate itself (it may still fail for
// other reasons — no file provided, etc. — that's not what's being
// tested here), and Staff is still correctly rejected. Real DB, only the
// Clerk/Next request-context seam mocked.
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

async function createBusinessWithMember(role: "admin" | "staff") {
  const clerkUserId = `user_admin_routes_test_${randomUUID()}`;
  const business = await prisma.business.create({
    data: {
      name: `Admin Routes Test Business ${randomUUID()}`,
      slug: `admin-routes-test-${randomUUID()}`,
      email: `admin-routes-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const user = await prisma.user.create({
    data: {
      email: `admin-routes-test-user-${randomUUID()}@example.invalid`,
      authProviderId: clerkUserId,
      name: "Admin Routes Test User",
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

describe("POST /api/business/complete-onboarding", () => {
  it("succeeds for a real admin request", async () => {
    const { clerkUserId, business } = await createBusinessWithMember("admin");
    await mockedAuthAs(clerkUserId);

    const { POST } = await import("@/app/api/business/complete-onboarding/route");
    const response = await POST();
    expect(response.status).toBe(200);

    const updated = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(updated.onboardingCompletedAt).not.toBeNull();
  });

  it("still rejects a genuine staff-role request with 403", async () => {
    const { clerkUserId } = await createBusinessWithMember("staff");
    await mockedAuthAs(clerkUserId);

    const { POST } = await import("@/app/api/business/complete-onboarding/route");
    const response = await POST();
    expect(response.status).toBe(403);
  });
});

describe("POST/DELETE /api/business/logo — the auth gate specifically", () => {
  it("an admin request passes the auth gate (fails later, on 'no file provided', not 403)", async () => {
    const { clerkUserId } = await createBusinessWithMember("admin");
    await mockedAuthAs(clerkUserId);

    const { POST } = await import("@/app/api/business/logo/route");
    const request = new NextRequest("http://localhost/api/business/logo", {
      method: "POST",
      body: new FormData(),
    });
    const response = await POST(request);
    expect(response.status).not.toBe(403);
    expect(response.status).toBe(400);
  });

  it("a staff request is rejected with 403 before ever reaching the upload logic", async () => {
    const { clerkUserId } = await createBusinessWithMember("staff");
    await mockedAuthAs(clerkUserId);

    const { POST } = await import("@/app/api/business/logo/route");
    const request = new NextRequest("http://localhost/api/business/logo", {
      method: "POST",
      body: new FormData(),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("an admin DELETE succeeds (no logo set, so the storage call is a no-op)", async () => {
    const { clerkUserId, business } = await createBusinessWithMember("admin");
    await mockedAuthAs(clerkUserId);

    const { DELETE } = await import("@/app/api/business/logo/route");
    const response = await DELETE();
    expect(response.status).toBe(200);

    const updated = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(updated.logoUrl).toBeNull();
  });

  it("a staff DELETE is rejected with 403", async () => {
    const { clerkUserId } = await createBusinessWithMember("staff");
    await mockedAuthAs(clerkUserId);

    const { DELETE } = await import("@/app/api/business/logo/route");
    const response = await DELETE();
    expect(response.status).toBe(403);
  });
});
