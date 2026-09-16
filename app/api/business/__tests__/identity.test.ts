import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// PATCH /api/business/identity — owner-only, independent of GST. Real
// DB, only the Clerk/Next request-context seam mocked, same pattern as
// the rest of this test suite.
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
    await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds } } });
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
      email: `identity-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_identity_test_${randomUUID()}`,
      name: "Identity Test User",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function mockedAuthAs(clerkUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as never);
}

async function setupBusiness(role: "owner" | "admin" | "staff") {
  const business = await prisma.business.create({
    data: {
      name: `Identity Test Co ${randomUUID()}`,
      slug: `identity-test-${randomUUID()}`,
      email: `identity-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const user = await createUser();
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: user.id, role },
  });

  return { business, user };
}

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/business/identity", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/business/identity", () => {
  it("saves all four fields for the owner, independent of GST state", async () => {
    const { business, user } = await setupBusiness("owner");
    await mockedAuthAs(user.authProviderId);

    const { PATCH } = await import("@/app/api/business/identity/route");
    const response = await PATCH(
      patchRequest({
        pan: "abcde1234f",
        tan: "abcd12345e",
        cin: "u12345mh2020ptc123456",
        swiftCode: "abcdinbbxxx",
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    // Zod's .trim() doesn't uppercase — the UI does that client-side;
    // the route just persists whatever it's given verbatim.
    expect(body.business.pan).toBe("abcde1234f");
    expect(body.business.tan).toBe("abcd12345e");
    expect(body.business.cin).toBe("u12345mh2020ptc123456");
    expect(body.business.swiftCode).toBe("abcdinbbxxx");

    const saved = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    expect(saved.gstEnabled).toBe(false); // untouched by this route
  });

  it("accepts a partial update — leaving other fields untouched", async () => {
    const { user } = await setupBusiness("owner");
    await mockedAuthAs(user.authProviderId);

    const { PATCH } = await import("@/app/api/business/identity/route");
    await PATCH(patchRequest({ pan: "ABCDE1234F" }));
    const second = await PATCH(patchRequest({ tan: "ABCD12345E" }));
    const body = await second.json();

    expect(body.business.pan).toBe("ABCDE1234F");
    expect(body.business.tan).toBe("ABCD12345E");
  });

  it("clears a field when explicitly set to null", async () => {
    const { user } = await setupBusiness("owner");
    await mockedAuthAs(user.authProviderId);

    const { PATCH } = await import("@/app/api/business/identity/route");
    await PATCH(patchRequest({ pan: "ABCDE1234F" }));
    const response = await PATCH(patchRequest({ pan: null }));
    const body = await response.json();
    expect(body.business.pan).toBeNull();
  });

  it("rejects a non-owner (admin) request", async () => {
    const { user } = await setupBusiness("admin");
    await mockedAuthAs(user.authProviderId);

    const { PATCH } = await import("@/app/api/business/identity/route");
    const response = await PATCH(patchRequest({ pan: "ABCDE1234F" }));
    expect(response.status).toBe(403);
  });

  it("rejects a non-owner (staff) request", async () => {
    const { user } = await setupBusiness("staff");
    await mockedAuthAs(user.authProviderId);

    const { PATCH } = await import("@/app/api/business/identity/route");
    const response = await PATCH(patchRequest({ pan: "ABCDE1234F" }));
    expect(response.status).toBe(403);
  });
});
