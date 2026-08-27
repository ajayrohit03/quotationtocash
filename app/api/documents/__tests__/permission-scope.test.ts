import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// The end-to-end version of Finding A's fix (docs/permission-layer-design.md
// §1, §5), through the actual route handlers a real request hits — proves
// a Manager can no longer PATCH/mark-paid a subordinate's document
// directly, and that reassigning it first is the only way in, exactly the
// scenario requested for live verification with real accounts. Real DB,
// only the Clerk/Next request-context seam mocked.
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
      email: `perm-scope-route-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_perm_scope_route_test_${randomUUID()}`,
      name: "Perm Scope Route Test User",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function mockedAuthAs(clerkUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as never);
}

// manager — subordinate. Subordinate creates one draft quotation and one
// draft invoice.
async function setupOrg() {
  const business = await prisma.business.create({
    data: {
      name: `Perm Scope Route Test Co ${randomUUID()}`,
      slug: `perm-scope-route-test-${randomUUID()}`,
      email: `perm-scope-route-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Test Customer" },
  });

  const [manager, subordinate] = await Promise.all([createUser(), createUser()]);

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

  async function makeDoc(type: "quotation" | "invoice", label: string) {
    return prisma.document.create({
      data: {
        businessId: business.id,
        type,
        number: `PERM-${label}-${randomUUID().slice(0, 8)}`,
        customerId: customer.id,
        issueDate: new Date(),
        createdByUserId: subordinate.id,
        customerSnapshot: {},
        businessSnapshot: {},
      },
    });
  }

  const quotation = await makeDoc("quotation", "quote");
  const invoice = await makeDoc("invoice", "inv");

  return { business, manager, subordinate, quotation, invoice };
}

describe("PATCH /api/documents/[id] — Manager over a subordinate's document", () => {
  it("rejects a direct edit attempt before reassignment", async () => {
    const { quotation, manager } = await setupOrg();
    await mockedAuthAs(manager.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    const request = new NextRequest(
      `http://localhost/api/documents/${quotation.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Attempted direct edit" }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: quotation.id }),
    });
    expect(response.status).toBe(404);

    const unchanged = await prisma.document.findUniqueOrThrow({
      where: { id: quotation.id },
    });
    expect(unchanged.notes).toBeNull();
  });

  it("succeeds after POST .../reassign — the only bridge", async () => {
    const { quotation, manager } = await setupOrg();
    await mockedAuthAs(manager.authProviderId);

    const { POST: reassign } = await import(
      "@/app/api/documents/[id]/reassign/route"
    );
    const reassignRequest = new NextRequest(
      `http://localhost/api/documents/${quotation.id}/reassign`,
      { method: "POST" },
    );
    const reassignResponse = await reassign(reassignRequest, {
      params: Promise.resolve({ id: quotation.id }),
    });
    expect(reassignResponse.status).toBe(200);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    const patchRequest = new NextRequest(
      `http://localhost/api/documents/${quotation.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Edited after reassignment" }),
      },
    );
    const patchResponse = await PATCH(patchRequest, {
      params: Promise.resolve({ id: quotation.id }),
    });
    expect(patchResponse.status).toBe(200);
    const body = await patchResponse.json();
    expect(body.document.notes).toBe("Edited after reassignment");
  });
});

describe("POST /api/documents/[id]/mark-paid — Manager over a subordinate's invoice", () => {
  it("rejects marking it paid before reassignment", async () => {
    const { invoice, manager } = await setupOrg();
    await mockedAuthAs(manager.authProviderId);

    const { POST } = await import("@/app/api/documents/[id]/mark-paid/route");
    const request = new NextRequest(
      `http://localhost/api/documents/${invoice.id}/mark-paid`,
      { method: "POST" },
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: invoice.id }),
    });
    expect(response.status).toBe(404);

    const unchanged = await prisma.document.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(unchanged.status).toBe("draft");
  });

  it("still rejects mark-paid directly after reassignment (a draft can't be paid) but succeeds once sent", async () => {
    const { invoice, manager } = await setupOrg();
    await mockedAuthAs(manager.authProviderId);

    const { POST: reassign } = await import(
      "@/app/api/documents/[id]/reassign/route"
    );
    await reassign(
      new NextRequest(`http://localhost/api/documents/${invoice.id}/reassign`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: invoice.id }) },
    );

    // Move it to a payable status directly in the DB — this test is about
    // the scope/permission gate, not requireMarkPayableInvoice()'s own
    // status rules (covered elsewhere).
    await prisma.document.update({
      where: { id: invoice.id },
      data: { status: "sent" },
    });

    const { POST } = await import("@/app/api/documents/[id]/mark-paid/route");
    const response = await POST(
      new NextRequest(`http://localhost/api/documents/${invoice.id}/mark-paid`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: invoice.id }) },
    );
    expect(response.status).toBe(200);
  });
});

describe("POST /api/documents/[id]/reassign", () => {
  it("rejects reassigning a document outside the caller's view scope entirely", async () => {
    const { quotation } = await setupOrg();
    const outsider = await createUser();
    const outsiderBusiness = await prisma.business.create({
      data: {
        name: `Outsider Co ${randomUUID()}`,
        slug: `outsider-${randomUUID()}`,
        email: `outsider-${randomUUID()}@example.invalid`,
      },
    });
    createdBusinessIds.push(outsiderBusiness.id);
    await prisma.businessMember.create({
      data: { businessId: outsiderBusiness.id, userId: outsider.id, role: "staff" },
    });
    await mockedAuthAs(outsider.authProviderId);

    const { POST } = await import("@/app/api/documents/[id]/reassign/route");
    const response = await POST(
      new NextRequest(`http://localhost/api/documents/${quotation.id}/reassign`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: quotation.id }) },
    );
    expect(response.status).toBe(404);

    const unchanged = await prisma.document.findUniqueOrThrow({
      where: { id: quotation.id },
    });
    expect(unchanged.createdByUserId).not.toBe(outsider.id);
  });
});
