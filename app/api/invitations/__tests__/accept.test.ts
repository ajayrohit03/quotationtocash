import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/auth/session";

// Proves the one thing the service-layer tests can't: that a real accept
// request sets the active-business cookie, so the person actually lands
// inside the business they just joined (docs/invitation-onboarding-design.md
// §4.3). Real DB, only the Clerk/Next request-context seam mocked.
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
      email: `accept-route-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_accept_route_test_${randomUUID()}`,
      name: "Accept Route Test User",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function mockedAuthAs(clerkUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as never);
}

describe("POST /api/invitations/accept", () => {
  it("accepts a matching-email invitation and sets the active-business cookie", async () => {
    const business = await prisma.business.create({
      data: {
        name: `Accept Route Test Co ${randomUUID()}`,
        slug: `accept-route-test-${randomUUID()}`,
        email: `accept-route-test-biz-${randomUUID()}@example.invalid`,
      },
    });
    createdBusinessIds.push(business.id);

    const owner = await createUser();
    await prisma.businessMember.create({
      data: { businessId: business.id, userId: owner.id, role: "owner" },
    });

    const invitee = await createUser();
    const { createOrResendInvitation } = await import("@/lib/invitations/service");
    const { rawToken } = await createOrResendInvitation(business, owner, {
      email: invitee.email,
      role: "staff",
      title: null,
      reportsToId: null,
    });

    await mockedAuthAs(invitee.authProviderId);

    const { POST } = await import("@/app/api/invitations/accept/route");
    const request = new NextRequest("http://localhost/api/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.businessId).toBe(business.id);

    const cookie = response.cookies.get(ACTIVE_BUSINESS_COOKIE);
    expect(cookie?.value).toBe(business.id);
  });

  it("rejects with 403 when the signed-in account's email doesn't match", async () => {
    const business = await prisma.business.create({
      data: {
        name: `Accept Route Test Co ${randomUUID()}`,
        slug: `accept-route-test-${randomUUID()}`,
        email: `accept-route-test-biz-${randomUUID()}@example.invalid`,
      },
    });
    createdBusinessIds.push(business.id);

    const owner = await createUser();
    await prisma.businessMember.create({
      data: { businessId: business.id, userId: owner.id, role: "owner" },
    });

    const invitee = await createUser();
    const wrongAccount = await createUser();
    const { createOrResendInvitation } = await import("@/lib/invitations/service");
    const { rawToken } = await createOrResendInvitation(business, owner, {
      email: invitee.email,
      role: "staff",
      title: null,
      reportsToId: null,
    });

    await mockedAuthAs(wrongAccount.authProviderId);

    const { POST } = await import("@/app/api/invitations/accept/route");
    const request = new NextRequest("http://localhost/api/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});
