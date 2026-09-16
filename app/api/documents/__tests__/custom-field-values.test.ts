import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// PATCH /api/documents/[id] — document-scope customFieldValues (stage 2
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
      email: `custom-field-values-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_custom_field_values_test_${randomUUID()}`,
      name: "Custom Field Values Test User",
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
      name: `Custom Field Values Test Co ${randomUUID()}`,
      slug: `custom-field-values-test-${randomUUID()}`,
      email: `custom-field-values-test-biz-${randomUUID()}@example.invalid`,
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
      label: "Container No.",
      type: "text",
      scope: "document",
    },
  });

  const document = await prisma.document.create({
    data: {
      businessId: business.id,
      type: "invoice",
      number: `CFV-${randomUUID().slice(0, 8)}`,
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

describe("PATCH /api/documents/[id] — document-scope customFieldValues", () => {
  it("saves a valid custom field value verbatim", async () => {
    const { owner, definition, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    const response = await PATCH(
      patchRequest(document.id, {
        customFieldValues: [
          {
            definitionId: definition.id,
            label: definition.label,
            type: "text",
            value: "MSKU1234567",
            sortOrder: 0,
          },
        ],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(response.status).toBe(200);

    const updated = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(updated.customFieldValues).toEqual([
      {
        definitionId: definition.id,
        label: "Container No.",
        type: "text",
        value: "MSKU1234567",
        sortOrder: 0,
      },
    ]);
  });

  it("rejects a definitionId that doesn't belong to this business", async () => {
    const { owner, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    const response = await PATCH(
      patchRequest(document.id, {
        customFieldValues: [
          {
            definitionId: randomUUID(),
            label: "Forged Field",
            type: "text",
            value: "anything",
            sortOrder: 0,
          },
        ],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(response.status).toBe(400);

    const unchanged = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(unchanged.customFieldValues).toEqual([]);
  });

  it("rejects a definitionId that belongs to this business but is line-item scope", async () => {
    const { business, owner, document } = await setupOrg();
    const lineItemDefinition = await prisma.customFieldDefinition.create({
      data: {
        businessId: business.id,
        label: "Gross Weight",
        type: "number",
        scope: "lineItem",
      },
    });
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    const response = await PATCH(
      patchRequest(document.id, {
        customFieldValues: [
          {
            definitionId: lineItemDefinition.id,
            label: lineItemDefinition.label,
            type: "number",
            value: 100,
            sortOrder: 0,
          },
        ],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(response.status).toBe(400);
  });

  it("replaces the whole array on a subsequent save, not a merge", async () => {
    const { owner, definition, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    await PATCH(
      patchRequest(document.id, {
        customFieldValues: [
          {
            definitionId: definition.id,
            label: definition.label,
            type: "text",
            value: "First value",
            sortOrder: 0,
          },
        ],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );

    // A second save with an empty array — e.g. the user cleared the
    // field — must actually clear it, not leave the old value behind.
    const response = await PATCH(patchRequest(document.id, { customFieldValues: [] }), {
      params: Promise.resolve({ id: document.id }),
    });
    expect(response.status).toBe(200);

    const updated = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(updated.customFieldValues).toEqual([]);
  });
});
