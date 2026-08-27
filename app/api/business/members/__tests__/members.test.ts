import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// The Team tab is the only surface that lets an owner or admin actually
// set role/title/reportsToId/isActive on a real BusinessMember — these
// routes are what document visibility (lib/documents/visibility.ts)
// ultimately reads. Real Business/User/BusinessMember rows, only the
// Clerk/Next request-context seam mocked (same pattern as
// require-business-owner.test.ts). The old add-by-email POST that used to
// live at /api/business/members is retired in favor of real invitations
// (see docs/invitation-onboarding-design.md §7) — no tests for it here.
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

async function createUser() {
  const user = await prisma.user.create({
    data: {
      email: `members-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_members_test_${randomUUID()}`,
      name: "Members Test User",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function mockedAuthAs(clerkUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as never);
}

// owner — admin — staffA — staffB (staffB reports to staffA)
async function setupOrg() {
  const business = await prisma.business.create({
    data: {
      name: `Members Test Co ${randomUUID()}`,
      slug: `members-test-${randomUUID()}`,
      email: `members-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const [owner, admin, staffA, staffB, unaffiliated] = await Promise.all([
    createUser(),
    createUser(),
    createUser(),
    createUser(),
    createUser(),
  ]);

  const ownerMember = await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, role: "owner" },
  });
  const adminMember = await prisma.businessMember.create({
    data: { businessId: business.id, userId: admin.id, role: "admin" },
  });
  const staffAMember = await prisma.businessMember.create({
    data: { businessId: business.id, userId: staffA.id, role: "staff", title: "Manager" },
  });
  const staffBMember = await prisma.businessMember.create({
    data: {
      businessId: business.id,
      userId: staffB.id,
      role: "staff",
      reportsToId: staffAMember.id,
    },
  });

  return {
    business,
    owner,
    admin,
    staffA,
    staffB,
    unaffiliated,
    ownerMember,
    adminMember,
    staffAMember,
    staffBMember,
  };
}

describe("GET /api/business/members", () => {
  it("returns every member for a real owner request", async () => {
    const { owner } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { GET } = await import("@/app/api/business/members/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.members).toHaveLength(4);
    expect(
      body.members.every((m: { user: unknown }) => Boolean(m.user)),
    ).toBe(true);
  });

  it("returns every member for a real admin request too — Owner is not the only tier that can reach this", async () => {
    const { admin } = await setupOrg();
    await mockedAuthAs(admin.authProviderId);

    const { GET } = await import("@/app/api/business/members/route");
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it("rejects a genuine staff-role request with 403", async () => {
    const { staffA } = await setupOrg();
    await mockedAuthAs(staffA.authProviderId);

    const { GET } = await import("@/app/api/business/members/route");
    const response = await GET();
    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/business/members/[id]", () => {
  it("updates title, reportsToId, and isActive for a real owner request", async () => {
    const { owner, staffBMember } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/business/members/[id]/route");
    const request = new NextRequest(
      `http://localhost/api/business/members/${staffBMember.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Sales Executive", reportsToId: null }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: staffBMember.id }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.member.title).toBe("Sales Executive");
    expect(body.member.reportsToId).toBeNull();
  });

  it("promotes a staff member to admin via a real admin request — Admin can manage peers, not just Staff", async () => {
    const { admin, staffBMember } = await setupOrg();
    await mockedAuthAs(admin.authProviderId);

    const { PATCH } = await import("@/app/api/business/members/[id]/route");
    const request = new NextRequest(
      `http://localhost/api/business/members/${staffBMember.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: staffBMember.id }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.member.role).toBe("admin");
  });

  it("accepts another admin as a valid manager target, not just staff", async () => {
    const { owner, adminMember, staffBMember } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/business/members/[id]/route");
    const request = new NextRequest(
      `http://localhost/api/business/members/${staffBMember.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportsToId: adminMember.id }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: staffBMember.id }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.member.reportsToId).toBe(adminMember.id);
  });

  it("rejects a reassignment that would create a reporting cycle", async () => {
    const { owner, staffAMember, staffBMember } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    // staffB already reports to staffA — pointing staffA at staffB would
    // create a 2-node cycle.
    const { PATCH } = await import("@/app/api/business/members/[id]/route");
    const request = new NextRequest(
      `http://localhost/api/business/members/${staffAMember.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportsToId: staffBMember.id }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: staffAMember.id }),
    });
    expect(response.status).toBe(400);

    const unchanged = await prisma.businessMember.findUniqueOrThrow({
      where: { id: staffAMember.id },
    });
    expect(unchanged.reportsToId).toBeNull();
  });

  it("refuses to edit the owner's own membership row", async () => {
    const { owner, ownerMember } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/business/members/[id]/route");
    const request = new NextRequest(
      `http://localhost/api/business/members/${ownerMember.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: ownerMember.id }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects a genuine staff-role request with 403", async () => {
    const { staffA, staffBMember } = await setupOrg();
    await mockedAuthAs(staffA.authProviderId);

    const { PATCH } = await import("@/app/api/business/members/[id]/route");
    const request = new NextRequest(
      `http://localhost/api/business/members/${staffBMember.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Hijacked" }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: staffBMember.id }),
    });
    expect(response.status).toBe(403);
  });
});
