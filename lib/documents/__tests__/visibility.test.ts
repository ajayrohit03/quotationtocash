import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";

// Real Business/User/BusinessMember/Document rows, a real hierarchy, and
// the real Prisma query — only the unavoidable Clerk/Next request-context
// seam is mocked (see lib/auth/__tests__/require-business-owner.test.ts,
// the direct precedent for this pattern). This is the test that actually
// proves the design doc's central claim: two members with the same title
// get different visibility based on their real position, not a role
// string, end to end against Postgres.
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
      email: `hierarchy-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_hierarchy_test_${randomUUID()}`,
      name: "Hierarchy Test User",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function mockedAuthAs(clerkUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as never);
}

// Builds: owner (role=owner) — seniorManager (root, no manager)
//           ├── manager1 — se1
//           └── manager2 — se2
// Plus one document per person, and one legacy (creator = null) document.
async function setupOrg() {
  const business = await prisma.business.create({
    data: {
      name: `Hierarchy Test Co ${randomUUID()}`,
      slug: `hierarchy-test-${randomUUID()}`,
      email: `hierarchy-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Test Customer" },
  });

  const [owner, seniorManager, manager1, manager2, se1, se2] =
    await Promise.all([
      createUser(),
      createUser(),
      createUser(),
      createUser(),
      createUser(),
      createUser(),
    ]);

  const ownerMember = await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, role: "owner" },
  });
  const seniorMember = await prisma.businessMember.create({
    data: { businessId: business.id, userId: seniorManager.id, role: "staff" },
  });
  const mgr1Member = await prisma.businessMember.create({
    data: {
      businessId: business.id,
      userId: manager1.id,
      role: "staff",
      reportsToId: seniorMember.id,
    },
  });
  const mgr2Member = await prisma.businessMember.create({
    data: {
      businessId: business.id,
      userId: manager2.id,
      role: "staff",
      reportsToId: seniorMember.id,
    },
  });
  await prisma.businessMember.create({
    data: {
      businessId: business.id,
      userId: se1.id,
      role: "staff",
      reportsToId: mgr1Member.id,
    },
  });
  await prisma.businessMember.create({
    data: {
      businessId: business.id,
      userId: se2.id,
      role: "staff",
      reportsToId: mgr2Member.id,
    },
  });

  async function makeDoc(creatorId: string | null, label: string) {
    return prisma.document.create({
      data: {
        businessId: business.id,
        type: "quotation",
        number: `TEST-${label}-${randomUUID().slice(0, 8)}`,
        customerId: customer.id,
        issueDate: new Date(),
        createdByUserId: creatorId,
        customerSnapshot: {},
        businessSnapshot: {},
      },
    });
  }

  const docs = {
    owner: await makeDoc(owner.id, "owner"),
    seniorManager: await makeDoc(seniorManager.id, "senior"),
    manager1: await makeDoc(manager1.id, "mgr1"),
    manager2: await makeDoc(manager2.id, "mgr2"),
    se1: await makeDoc(se1.id, "se1"),
    se2: await makeDoc(se2.id, "se2"),
    legacy: await makeDoc(null, "legacy"),
  };

  return {
    business,
    ownerMember,
    people: { owner, seniorManager, manager1, manager2, se1, se2 },
    docs,
  };
}

async function visibleDocIds(clerkUserId: string, businessId: string) {
  await mockedAuthAs(clerkUserId);
  const { documentScopeWhere } = await import("@/lib/documents/visibility");
  const where = await documentScopeWhere("view");
  const visible = await prisma.document.findMany({
    where: { businessId, ...where },
    select: { number: true },
  });
  return new Set(visible.map((d) => d.number));
}

describe("documentScopeWhere('view') — real hierarchy, real documents", () => {
  it("the owner sees every document regardless of who created it", async () => {
    const { business, people, docs } = await setupOrg();
    const visible = await visibleDocIds(
      people.owner.authProviderId,
      business.id,
    );
    expect(visible).toEqual(
      new Set(Object.values(docs).map((d) => d.number)),
    );
  });

  it("the Senior Manager sees their whole subtree and the legacy doc, not the owner's", async () => {
    const { business, people, docs } = await setupOrg();
    const visible = await visibleDocIds(
      people.seniorManager.authProviderId,
      business.id,
    );
    expect(visible).toEqual(
      new Set([
        docs.seniorManager.number,
        docs.manager1.number,
        docs.manager2.number,
        docs.se1.number,
        docs.se2.number,
        docs.legacy.number,
      ]),
    );
    expect(visible.has(docs.owner.number)).toBe(false);
  });

  it("two Managers with the identical title see only their own branch — the core guarantee", async () => {
    const { business, people, docs } = await setupOrg();

    const manager1Visible = await visibleDocIds(
      people.manager1.authProviderId,
      business.id,
    );
    expect(manager1Visible).toEqual(
      new Set([docs.manager1.number, docs.se1.number, docs.legacy.number]),
    );
    expect(manager1Visible.has(docs.se2.number)).toBe(false);
    expect(manager1Visible.has(docs.manager2.number)).toBe(false);
    expect(manager1Visible.has(docs.seniorManager.number)).toBe(false);
    expect(manager1Visible.has(docs.owner.number)).toBe(false);

    const manager2Visible = await visibleDocIds(
      people.manager2.authProviderId,
      business.id,
    );
    expect(manager2Visible).toEqual(
      new Set([docs.manager2.number, docs.se2.number, docs.legacy.number]),
    );
    expect(manager2Visible.has(docs.se1.number)).toBe(false);
    expect(manager2Visible.has(docs.manager1.number)).toBe(false);
  });

  it("a Sales Executive sees only their own document, plus the legacy one", async () => {
    const { business, people, docs } = await setupOrg();
    const visible = await visibleDocIds(
      people.se1.authProviderId,
      business.id,
    );
    expect(visible).toEqual(new Set([docs.se1.number, docs.legacy.number]));
  });
});
