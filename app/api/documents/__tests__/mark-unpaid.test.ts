import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// POST /api/documents/[id]/mark-unpaid — the reverse of mark-paid, for
// correcting an invoice marked paid too quickly. Real DB, only the
// Clerk/Next request-context seam mocked, same pattern as
// permission-scope.test.ts.
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

async function createUser(name = "Mark Unpaid Test User") {
  const user = await prisma.user.create({
    data: {
      email: `mark-unpaid-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_mark_unpaid_test_${randomUUID()}`,
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

async function setupOrg() {
  const business = await prisma.business.create({
    data: {
      name: `Mark Unpaid Test Co ${randomUUID()}`,
      slug: `mark-unpaid-test-${randomUUID()}`,
      email: `mark-unpaid-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Test Customer" },
  });

  const owner = await createUser("Owner User");
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, role: "owner" },
  });

  const [manager, subordinate] = await Promise.all([
    createUser("Manager User"),
    createUser("Subordinate User"),
  ]);
  const managerMember = await prisma.businessMember.create({
    data: { businessId: business.id, userId: manager.id, role: "staff" },
  });
  await prisma.businessMember.create({
    data: {
      businessId: business.id,
      userId: subordinate.id,
      role: "staff",
      reportsToId: managerMember.id,
    },
  });

  async function makeInvoice(status: string, createdByUserId: string) {
    return prisma.document.create({
      data: {
        businessId: business.id,
        type: "invoice",
        number: `MU-${randomUUID().slice(0, 8)}`,
        customerId: customer.id,
        issueDate: new Date(),
        createdByUserId,
        status,
        customerSnapshot: {},
        businessSnapshot: {},
      },
    });
  }

  return { business, customer, owner, manager, subordinate, makeInvoice };
}

describe("POST /api/documents/[id]/mark-unpaid", () => {
  it("reverts a paid invoice to draft for an allowed role (owner) and leaves a trace note", async () => {
    const { owner, makeInvoice } = await setupOrg();
    const invoice = await makeInvoice("paid", owner.id);
    await mockedAuthAs(owner.authProviderId);

    const { POST } = await import("@/app/api/documents/[id]/mark-unpaid/route");
    const response = await POST(
      new NextRequest(`http://localhost/api/documents/${invoice.id}/mark-unpaid`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: invoice.id }) },
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.document.status).toBe("draft");
    expect(body.document.notes).toContain("Marked unpaid by Owner User on");
    expect(body.document.notes).toContain("was previously paid");

    const persisted = await prisma.document.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(persisted.status).toBe("draft");
    expect(persisted.notes).toContain("Marked unpaid by Owner User on");
  });

  it("preserves existing notes below the new trace note", async () => {
    const { owner, makeInvoice } = await setupOrg();
    const invoice = await prisma.document.update({
      where: { id: (await makeInvoice("paid", owner.id)).id },
      data: { notes: "Original customer note." },
    });
    await mockedAuthAs(owner.authProviderId);

    const { POST } = await import("@/app/api/documents/[id]/mark-unpaid/route");
    const response = await POST(
      new NextRequest(`http://localhost/api/documents/${invoice.id}/mark-unpaid`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: invoice.id }) },
    );
    const body = await response.json();
    expect(body.document.notes).toContain("Marked unpaid by Owner User on");
    expect(body.document.notes).toContain("Original customer note.");
  });

  it("rejects a non-paid invoice with a 4xx", async () => {
    const { owner, makeInvoice } = await setupOrg();
    const invoice = await makeInvoice("sent", owner.id);
    await mockedAuthAs(owner.authProviderId);

    const { POST } = await import("@/app/api/documents/[id]/mark-unpaid/route");
    const response = await POST(
      new NextRequest(`http://localhost/api/documents/${invoice.id}/mark-unpaid`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: invoice.id }) },
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    const unchanged = await prisma.document.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(unchanged.status).toBe("sent");
  });

  it("rejects a Manager acting on a subordinate's paid invoice (out of mutate scope) before reassignment", async () => {
    const { subordinate, manager, makeInvoice } = await setupOrg();
    const invoice = await makeInvoice("paid", subordinate.id);
    await mockedAuthAs(manager.authProviderId);

    const { POST } = await import("@/app/api/documents/[id]/mark-unpaid/route");
    const response = await POST(
      new NextRequest(`http://localhost/api/documents/${invoice.id}/mark-unpaid`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: invoice.id }) },
    );
    expect(response.status).toBe(404);

    const unchanged = await prisma.document.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(unchanged.status).toBe("paid");
  });
});
