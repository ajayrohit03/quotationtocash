import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Document.logoSize/signatureSize — real per-document columns (see
// schema.prisma's own comment), not businessSnapshot keys. Covers both
// halves of the fix: POST /api/documents copies the business's current
// preference in at creation (mirroring template/accentColor), and PATCH
// /api/documents/:id can adjust logoSize on a draft via the normal
// appearance-update flow.
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

async function createUser(name = "Logo Size Test User") {
  const user = await prisma.user.create({
    data: {
      email: `logo-size-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_logo_size_test_${randomUUID()}`,
      name,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function mockedAuthAs(clerkUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as never);
}

describe("Document.logoSize / signatureSize", () => {
  it("a document created via POST copies the business's current logo/signature size preference", async () => {
    const business = await prisma.business.create({
      data: {
        name: `Logo Size Test Co ${randomUUID()}`,
        slug: `logo-size-test-${randomUUID()}`,
        email: `logo-size-test-biz-${randomUUID()}@example.invalid`,
        logoSize: "lg",
        signatureSize: "sm",
      },
    });
    createdBusinessIds.push(business.id);
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: "Test Customer" },
    });
    const owner = await createUser();
    await prisma.businessMember.create({
      data: { businessId: business.id, userId: owner.id, role: "owner" },
    });
    await mockedAuthAs(owner.authProviderId);

    const { POST } = await import("@/app/api/documents/route");
    const response = await POST(
      new NextRequest("http://localhost/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "invoice", customerId: customer.id }),
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.document.logoSize).toBe("lg");
    expect(body.document.signatureSize).toBe("sm");
  });

  it("a document row inserted without an explicit size gets the column default (fixes the old, snapshot-less-document case)", async () => {
    const business = await prisma.business.create({
      data: {
        name: `Logo Size Default Co ${randomUUID()}`,
        slug: `logo-size-default-${randomUUID()}`,
        email: `logo-size-default-biz-${randomUUID()}@example.invalid`,
      },
    });
    createdBusinessIds.push(business.id);
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: "Test Customer" },
    });

    // Simulates the exact case Problem A described: nothing sets
    // logoSize/signatureSize explicitly (as no pre-migration document
    // ever had them at all) — the column's own DB default applies
    // immediately, with no re-save required.
    const document = await prisma.document.create({
      data: {
        businessId: business.id,
        type: "invoice",
        number: `TEST-${randomUUID()}`,
        customerId: customer.id,
        issueDate: new Date(),
        customerSnapshot: {},
        businessSnapshot: {},
      },
    });
    expect(document.logoSize).toBe("md");
    expect(document.signatureSize).toBe("md");
  });

  it("logoSize is editable on a draft via the normal appearance-update PATCH flow, same tier as accentColor/fontSize", async () => {
    const business = await prisma.business.create({
      data: {
        name: `Logo Size Patch Co ${randomUUID()}`,
        slug: `logo-size-patch-${randomUUID()}`,
        email: `logo-size-patch-biz-${randomUUID()}@example.invalid`,
      },
    });
    createdBusinessIds.push(business.id);
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: "Test Customer" },
    });
    const owner = await createUser();
    await prisma.businessMember.create({
      data: { businessId: business.id, userId: owner.id, role: "owner" },
    });
    await mockedAuthAs(owner.authProviderId);

    const document = await prisma.document.create({
      data: {
        businessId: business.id,
        type: "invoice",
        number: `TEST-${randomUUID()}`,
        customerId: customer.id,
        issueDate: new Date(),
        createdByUserId: owner.id,
        customerSnapshot: {},
        businessSnapshot: {},
      },
    });

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    const response = await PATCH(
      new NextRequest(`http://localhost/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoSize: "xl" }),
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.document.logoSize).toBe("xl");
  });
});
