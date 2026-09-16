import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// PATCH /api/documents/[id] — LineItem-scope customFieldValues (stage 5
// of docs/custom-fields-and-multicurrency-design.md). Real DB, only the
// Clerk/Next request-context seam mocked, same pattern as the rest of
// this test suite.
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
    await prisma.document.deleteMany({
      where: { businessId: { in: createdBusinessIds } },
    });
    await prisma.customFieldDefinition.deleteMany({
      where: { businessId: { in: createdBusinessIds } },
    });
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
      email: `line-item-cfv-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_line_item_cfv_test_${randomUUID()}`,
      name: "Line Item CFV Test User",
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
      name: `Line Item CFV Test Co ${randomUUID()}`,
      slug: `line-item-cfv-test-${randomUUID()}`,
      email: `line-item-cfv-test-biz-${randomUUID()}@example.invalid`,
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

  const definition = await prisma.customFieldDefinition.create({
    data: {
      businessId: business.id,
      label: "SAC Code",
      type: "text",
      scope: "lineItem",
    },
  });

  const document = await prisma.document.create({
    data: {
      businessId: business.id,
      type: "invoice",
      number: `LICFV-${randomUUID().slice(0, 8)}`,
      customerId: customer.id,
      issueDate: new Date(),
      createdByUserId: owner.id,
      customerSnapshot: {},
      businessSnapshot: {},
    },
  });

  return { business, owner, definition, document };
}

function patchRequest(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/documents/[id] — line-item-scope customFieldValues", () => {
  it("saves a valid line-item custom field value verbatim", async () => {
    const { owner, definition, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    const response = await PATCH(
      patchRequest(document.id, {
        lineItems: [
          {
            name: "Freight Forwarding",
            qty: 1,
            rate: 5000,
            customFieldValues: [
              {
                definitionId: definition.id,
                label: definition.label,
                type: "text",
                value: "998399",
                sortOrder: 0,
              },
            ],
          },
        ],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(response.status).toBe(200);

    const saved = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
      include: { lineItems: true },
    });
    expect(saved.lineItems[0].customFieldValues).toEqual([
      { definitionId: definition.id, label: "SAC Code", type: "text", value: "998399", sortOrder: 0 },
    ]);
  });

  it("rejects a definitionId that belongs to this business but is document scope", async () => {
    const { business, owner, document } = await setupOrg();
    const documentScopeDefinition = await prisma.customFieldDefinition.create({
      data: {
        businessId: business.id,
        label: "Job No",
        type: "text",
        scope: "document",
      },
    });
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    const response = await PATCH(
      patchRequest(document.id, {
        lineItems: [
          {
            name: "Line",
            qty: 1,
            rate: 100,
            customFieldValues: [
              {
                definitionId: documentScopeDefinition.id,
                label: documentScopeDefinition.label,
                type: "text",
                value: "should not save",
                sortOrder: 0,
              },
            ],
          },
        ],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(response.status).toBe(400);
  });

  it("rejects a definitionId that doesn't belong to this business", async () => {
    const { owner, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    const response = await PATCH(
      patchRequest(document.id, {
        lineItems: [
          {
            name: "Line",
            qty: 1,
            rate: 100,
            customFieldValues: [
              {
                definitionId: randomUUID(),
                label: "Forged",
                type: "text",
                value: "x",
                sortOrder: 0,
              },
            ],
          },
        ],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(response.status).toBe(400);
  });

  it("keeps each line item's values independent — one row's fields don't leak into another's", async () => {
    const { owner, definition, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    const response = await PATCH(
      patchRequest(document.id, {
        lineItems: [
          {
            name: "Row A",
            qty: 1,
            rate: 100,
            customFieldValues: [
              { definitionId: definition.id, label: definition.label, type: "text", value: "AAA", sortOrder: 0 },
            ],
          },
          { name: "Row B", qty: 1, rate: 100 },
        ],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(response.status).toBe(200);

    const saved = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
    expect(saved.lineItems[0].customFieldValues).toEqual([
      { definitionId: definition.id, label: "SAC Code", type: "text", value: "AAA", sortOrder: 0 },
    ]);
    expect(saved.lineItems[1].customFieldValues).toEqual([]);
  });
});
