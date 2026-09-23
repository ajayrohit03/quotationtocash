import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { DocumentType } from "@prisma/client";

// POST /api/documents/[id]/finalize — locks a draft invoice/proforma
// from further editing, a one-way door (no un-finalize). Real DB, only
// the Clerk/Next request-context seam mocked, same pattern as the rest
// of this test suite.
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

async function createUser(name = "Finalize Test User") {
  const user = await prisma.user.create({
    data: {
      email: `finalize-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_finalize_test_${randomUUID()}`,
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
      name: `Finalize Test Co ${randomUUID()}`,
      slug: `finalize-test-${randomUUID()}`,
      email: `finalize-test-biz-${randomUUID()}@example.invalid`,
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

  const staff = await createUser("Staff User");
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: staff.id, role: "staff" },
  });

  async function makeDocument(
    type: DocumentType,
    status: string,
    createdByUserId: string = owner.id,
  ) {
    return prisma.document.create({
      data: {
        businessId: business.id,
        type,
        number: `FIN-${randomUUID().slice(0, 8)}`,
        customerId: customer.id,
        issueDate: new Date(),
        createdByUserId,
        status,
        customerSnapshot: {},
        businessSnapshot: {},
      },
    });
  }

  return { business, customer, owner, staff, makeDocument };
}

async function finalize(documentId: string) {
  const { POST } = await import("@/app/api/documents/[id]/finalize/route");
  return POST(
    new NextRequest(`http://localhost/api/documents/${documentId}/finalize`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id: documentId }) },
  );
}

describe("POST /api/documents/[id]/finalize", () => {
  it("finalizes a draft invoice", async () => {
    const { owner, makeDocument } = await setupOrg();
    const invoice = await makeDocument("invoice", "draft");
    await mockedAuthAs(owner.authProviderId);

    const response = await finalize(invoice.id);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.document.status).toBe("finalized");
  });

  it("finalizes a draft proforma", async () => {
    const { owner, makeDocument } = await setupOrg();
    const proforma = await makeDocument("proforma", "draft");
    await mockedAuthAs(owner.authProviderId);

    const response = await finalize(proforma.id);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.document.status).toBe("finalized");
  });

  it("rejects finalizing a quotation", async () => {
    const { owner, makeDocument } = await setupOrg();
    const quotation = await makeDocument("quotation", "draft");
    await mockedAuthAs(owner.authProviderId);

    const response = await finalize(quotation.id);
    expect(response.status).toBe(400);
  });

  it("rejects finalizing a non-draft invoice", async () => {
    const { owner, makeDocument } = await setupOrg();
    const invoice = await makeDocument("invoice", "sent");
    await mockedAuthAs(owner.authProviderId);

    const response = await finalize(invoice.id);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("is a one-way door — an already-finalized invoice can't be finalized again", async () => {
    const { owner, makeDocument } = await setupOrg();
    const invoice = await makeDocument("invoice", "finalized");
    await mockedAuthAs(owner.authProviderId);

    const response = await finalize(invoice.id);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("staff can finalize their own document — same invoices.edit permission tier as mark-paid", async () => {
    const { staff, makeDocument } = await setupOrg();
    // "mutate" scope for a non-owner/admin is own-documents-only (see
    // lib/documents/visibility.ts) — this proves the permission gate,
    // not scope, so the document must be staff's own.
    const invoice = await makeDocument("invoice", "draft", staff.id);
    await mockedAuthAs(staff.authProviderId);

    const response = await finalize(invoice.id);
    expect(response.status).toBe(200);
  });
});
