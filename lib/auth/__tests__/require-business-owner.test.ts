import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// "Only owners can modify business/tax settings" is a real authorization
// boundary, not just a UI nicety — the request from live testing was
// specifically to prove requireBusinessOwner() rejects a genuine
// staff-role request, not just that the helper's own if-check reads
// correctly in isolation. That means: a real Business + BusinessMember
// row in the actual database (no mocked Prisma), with only the
// unavoidable Next.js/Clerk request-context seam mocked — auth() and
// cookies() can't run outside a real request, so those two functions are
// the only things stubbed. lib/auth/session.ts itself, and the route
// handlers built on it, run completely unmodified.
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

async function createBusinessWithMember(role: "owner" | "staff") {
  const clerkUserId = `user_owner_test_${randomUUID()}`;
  const business = await prisma.business.create({
    data: {
      name: `Owner Test Business ${randomUUID()}`,
      slug: `owner-test-${randomUUID()}`,
      email: `owner-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const user = await prisma.user.create({
    data: {
      email: `owner-test-user-${randomUUID()}@example.invalid`,
      authProviderId: clerkUserId,
      name: "Owner Test User",
    },
  });
  createdUserIds.push(user.id);

  await prisma.businessMember.create({
    data: { businessId: business.id, userId: user.id, role },
  });

  return { clerkUserId, business };
}

// Every test resets modules and re-imports fresh — requireAuth/
// requireBusiness are wrapped in React's cache(), which memoizes by
// call-site outside of an actual per-request scope; without this, a
// staff-role result from one test could leak into the next.
async function mockedAuthAs(clerkUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as never);
}

describe("requireBusinessOwner — real DB, real route handlers", () => {
  it("throws ForbiddenError for a genuine staff-role membership", async () => {
    const { clerkUserId } = await createBusinessWithMember("staff");
    await mockedAuthAs(clerkUserId);

    const { requireBusinessOwner } = await import("@/lib/auth/session");
    const { ForbiddenError } = await import("@/lib/auth/errors");
    await expect(requireBusinessOwner()).rejects.toThrow(ForbiddenError);
  });

  it("does not throw for a genuine owner-role membership", async () => {
    const { clerkUserId, business } = await createBusinessWithMember("owner");
    await mockedAuthAs(clerkUserId);

    const { requireBusinessOwner } = await import("@/lib/auth/session");
    const result = await requireBusinessOwner();
    expect(result.business.id).toBe(business.id);
    expect(result.membership.role).toBe("owner");
  });

  it("PATCH /api/business rejects a staff-role request with 403, unchanged", async () => {
    const { clerkUserId, business } = await createBusinessWithMember("staff");
    await mockedAuthAs(clerkUserId);

    const { PATCH } = await import("@/app/api/business/route");
    const request = new NextRequest("http://localhost/api/business", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed by staff" }),
    });
    const response = await PATCH(request);
    expect(response.status).toBe(403);

    const unchanged = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(unchanged.name).toBe(business.name);
  });

  it("PATCH /api/business succeeds for a real owner-role request", async () => {
    const { clerkUserId, business } = await createBusinessWithMember("owner");
    await mockedAuthAs(clerkUserId);

    const { PATCH } = await import("@/app/api/business/route");
    const request = new NextRequest("http://localhost/api/business", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed by owner" }),
    });
    const response = await PATCH(request);
    expect(response.status).toBe(200);

    const updated = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(updated.name).toBe("Renamed by owner");
  });

  it("PATCH /api/business/gst rejects a staff-role request with 403", async () => {
    const { clerkUserId } = await createBusinessWithMember("staff");
    await mockedAuthAs(clerkUserId);

    const { PATCH } = await import("@/app/api/business/gst/route");
    const request = new NextRequest("http://localhost/api/business/gst", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gstEnabled: false }),
    });
    const response = await PATCH(request);
    expect(response.status).toBe(403);
  });
});
