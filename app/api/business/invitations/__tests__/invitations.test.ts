import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Route-level coverage on top of lib/invitations/__tests__/service.test.ts
// — that file proves the domain logic; this proves the actual HTTP layer
// (auth gate, status codes, response shape) matches it. Real DB, only the
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

async function createUser() {
  const user = await prisma.user.create({
    data: {
      email: `invitations-route-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_invitations_route_test_${randomUUID()}`,
      name: "Invitations Route Test User",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function setupBusiness(role: "owner" | "admin" | "staff") {
  const business = await prisma.business.create({
    data: {
      name: `Invitations Route Test Co ${randomUUID()}`,
      slug: `invitations-route-test-${randomUUID()}`,
      email: `invitations-route-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const user = await createUser();
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: user.id, role },
  });

  return { business, user };
}

async function mockedAuthAs(clerkUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as never);
}

describe("POST /api/business/invitations", () => {
  it("creates an invitation for a real owner request and returns a copyable acceptUrl", async () => {
    const { user } = await setupBusiness("owner");
    await mockedAuthAs(user.authProviderId);

    const { POST } = await import("@/app/api/business/invitations/route");
    const request = new NextRequest("http://localhost/api/business/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `invitee-${randomUUID()}@example.invalid`,
        role: "staff",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.acceptUrl).toContain("/invite/");
    expect(body.invitation.status).toBe("pending");
  });

  it("succeeds for a real admin request too", async () => {
    const { user } = await setupBusiness("admin");
    await mockedAuthAs(user.authProviderId);

    const { POST } = await import("@/app/api/business/invitations/route");
    const request = new NextRequest("http://localhost/api/business/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `invitee-${randomUUID()}@example.invalid`,
        role: "staff",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
  });

  it("rejects a genuine staff-role request with 403", async () => {
    const { user } = await setupBusiness("staff");
    await mockedAuthAs(user.authProviderId);

    const { POST } = await import("@/app/api/business/invitations/route");
    const request = new NextRequest("http://localhost/api/business/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `invitee-${randomUUID()}@example.invalid`,
        role: "staff",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("rejects role: 'owner' at the validation layer", async () => {
    const { user } = await setupBusiness("owner");
    await mockedAuthAs(user.authProviderId);

    const { POST } = await import("@/app/api/business/invitations/route");
    const request = new NextRequest("http://localhost/api/business/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `invitee-${randomUUID()}@example.invalid`,
        role: "owner",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe("GET /api/business/invitations", () => {
  it("rejects a genuine staff-role request with 403", async () => {
    const { user } = await setupBusiness("staff");
    await mockedAuthAs(user.authProviderId);

    const { GET } = await import("@/app/api/business/invitations/route");
    const response = await GET();
    expect(response.status).toBe(403);
  });
});
