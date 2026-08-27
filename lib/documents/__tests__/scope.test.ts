import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";

// The direct test for Finding A's fix (docs/permission-layer-design.md
// §1, §5): documentScopeWhere("mutate") must return own-documents-only
// for a Manager, even though documentScopeWhere("view") correctly
// returns their whole subtree — before this fix, both actions shared one
// function, silently granting a Manager full edit/delete access across
// their entire subtree. Real DB, only the Clerk/Next request-context
// seam mocked.
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
      email: `scope-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_scope_test_${randomUUID()}`,
      name: "Scope Test User",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function mockedAuthAs(clerkUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as never);
}

// manager — subordinate, each with one document
async function setupOrg() {
  const business = await prisma.business.create({
    data: {
      name: `Scope Test Co ${randomUUID()}`,
      slug: `scope-test-${randomUUID()}`,
      email: `scope-test-biz-${randomUUID()}@example.invalid`,
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

  async function makeDoc(creatorId: string, label: string) {
    return prisma.document.create({
      data: {
        businessId: business.id,
        type: "quotation",
        number: `SCOPE-${label}-${randomUUID().slice(0, 8)}`,
        customerId: customer.id,
        issueDate: new Date(),
        createdByUserId: creatorId,
        customerSnapshot: {},
        businessSnapshot: {},
      },
    });
  }

  const docs = {
    manager: await makeDoc(manager.id, "manager"),
    subordinate: await makeDoc(subordinate.id, "subordinate"),
  };

  return { business, manager, subordinate, docs };
}

describe("documentScopeWhere — view vs mutate diverge for a Manager", () => {
  it("view scope includes the subordinate's document (unchanged hierarchy behavior)", async () => {
    const { documentScopeWhere } = await import("@/lib/documents/visibility");
    const { business, manager, docs } = await setupOrg();
    await mockedAuthAs(manager.authProviderId);

    const where = await documentScopeWhere("view");
    const visible = await prisma.document.findMany({
      where: { businessId: business.id, ...where },
      select: { number: true },
    });
    const numbers = visible.map((d) => d.number);
    expect(numbers).toContain(docs.manager.number);
    expect(numbers).toContain(docs.subordinate.number);
  });

  it("mutate scope excludes the subordinate's document — this is Finding A's fix", async () => {
    const { documentScopeWhere } = await import("@/lib/documents/visibility");
    const { business, manager, docs } = await setupOrg();
    await mockedAuthAs(manager.authProviderId);

    const where = await documentScopeWhere("mutate");
    const mutable = await prisma.document.findMany({
      where: { businessId: business.id, ...where },
      select: { number: true },
    });
    const numbers = mutable.map((d) => d.number);
    expect(numbers).toContain(docs.manager.number);
    expect(numbers).not.toContain(docs.subordinate.number);
  });

  it("after reassignment, the document is in the Manager's own mutate scope", async () => {
    const { documentScopeWhere } = await import("@/lib/documents/visibility");
    const { business, manager, docs } = await setupOrg();

    await prisma.document.update({
      where: { id: docs.subordinate.id },
      data: { createdByUserId: manager.id },
    });

    await mockedAuthAs(manager.authProviderId);
    const where = await documentScopeWhere("mutate");
    const mutable = await prisma.document.findMany({
      where: { businessId: business.id, ...where },
      select: { number: true },
    });
    expect(mutable.map((d) => d.number)).toContain(docs.subordinate.number);
  });
});
