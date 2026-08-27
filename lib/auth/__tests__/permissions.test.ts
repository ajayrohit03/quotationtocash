import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";

// Real Business/User/BusinessMember rows — Manager is derived from real
// reportsToId edges, not mocked, since the whole point of this module is
// that it can't drift out of sync with that data. Only the Clerk/Next
// request-context seam is mocked (same pattern as every other real-DB
// auth test in this project).
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
      email: `permissions-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_permissions_test_${randomUUID()}`,
      name: "Permissions Test User",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function mockedAuthAs(clerkUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as never);
}

// owner — admin — managerWithReport — subordinate
// plainStaff (no reports, reports to nobody)
async function setupOrg() {
  const business = await prisma.business.create({
    data: {
      name: `Permissions Test Co ${randomUUID()}`,
      slug: `permissions-test-${randomUUID()}`,
      email: `permissions-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const [owner, admin, managerUser, subordinate, plainStaff] = await Promise.all([
    createUser(),
    createUser(),
    createUser(),
    createUser(),
    createUser(),
  ]);

  await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, role: "owner" },
  });
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: admin.id, role: "admin" },
  });
  const managerMember = await prisma.businessMember.create({
    data: { businessId: business.id, userId: managerUser.id, role: "staff" },
  });
  await prisma.businessMember.create({
    data: {
      businessId: business.id,
      userId: subordinate.id,
      role: "staff",
      reportsToId: managerMember.id,
    },
  });
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: plainStaff.id, role: "staff" },
  });

  return { business, owner, admin, managerUser, managerMember, subordinate, plainStaff };
}

describe("isManager — derived live from reportsToId, never stored", () => {
  it("is true for staff with at least one active direct report", async () => {
    const { isManager } = await import("@/lib/auth/permissions");
    const { managerMember } = await setupOrg();
    expect(await isManager(managerMember.id)).toBe(true);
  });

  it("is false for staff with no direct reports", async () => {
    const { isManager } = await import("@/lib/auth/permissions");
    const { business, plainStaff } = await setupOrg();
    const member = await prisma.businessMember.findUniqueOrThrow({
      where: { businessId_userId: { businessId: business.id, userId: plainStaff.id } },
    });
    expect(await isManager(member.id)).toBe(false);
  });

  it("flips to false the moment the last direct report is deactivated — no manual reassignment step", async () => {
    const { isManager } = await import("@/lib/auth/permissions");
    const { business, managerMember, subordinate } = await setupOrg();
    expect(await isManager(managerMember.id)).toBe(true);

    await prisma.businessMember.update({
      where: {
        businessId_userId: { businessId: business.id, userId: subordinate.id },
      },
      data: { isActive: false },
    });

    // Fresh module import — isManager() is memoized per-request via
    // React cache(), and this is a new "request" (fresh import), not a
    // stale read of the same cached promise.
    vi.resetModules();
    const { isManager: isManagerAgain } = await import("@/lib/auth/permissions");
    expect(await isManagerAgain(managerMember.id)).toBe(false);
  });
});

describe("hasPermission / requirePermission", () => {
  it("owner has every permission, including organization.tax", async () => {
    const { requirePermission } = await import("@/lib/auth/permissions");
    const { owner } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    await expect(requirePermission("organization.tax")).resolves.toBeDefined();
    await expect(requirePermission("users.manage")).resolves.toBeDefined();
    await expect(requirePermission("quotations.delete")).resolves.toBeDefined();
  });

  it("admin has everything except organization.tax", async () => {
    const { requirePermission } = await import("@/lib/auth/permissions");
    const { ForbiddenError } = await import("@/lib/auth/errors");
    const { admin } = await setupOrg();
    await mockedAuthAs(admin.authProviderId);

    await expect(requirePermission("organization.manage")).resolves.toBeDefined();
    await expect(requirePermission("users.manage")).resolves.toBeDefined();
    await expect(requirePermission("organization.tax")).rejects.toThrow(ForbiddenError);
  });

  it("a Manager (derived) has reports.view; plain Staff does not", async () => {
    const { requirePermission } = await import("@/lib/auth/permissions");
    const { managerUser, plainStaff } = await setupOrg();

    await mockedAuthAs(managerUser.authProviderId);
    await expect(requirePermission("reports.view")).resolves.toBeDefined();

    vi.resetModules();
    const { requirePermission: requirePermissionAgain } = await import(
      "@/lib/auth/permissions"
    );
    const { ForbiddenError } = await import("@/lib/auth/errors");
    await mockedAuthAs(plainStaff.authProviderId);
    await expect(requirePermissionAgain("reports.view")).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("Manager and plain Staff have identical quotations/invoices permissions — the only difference is reports.view (design doc §0)", async () => {
    const { hasPermission } = await import("@/lib/auth/permissions");
    const { requireBusiness } = await import("@/lib/auth/session");
    const { managerUser, plainStaff } = await setupOrg();

    await mockedAuthAs(managerUser.authProviderId);
    const managerContext = await requireBusiness();
    const managerHasEdit = await hasPermission(managerContext, "quotations.edit");

    vi.resetModules();
    const { hasPermission: hasPermissionAgain } = await import("@/lib/auth/permissions");
    const { requireBusiness: requireBusinessAgain } = await import("@/lib/auth/session");
    await mockedAuthAs(plainStaff.authProviderId);
    const staffContext = await requireBusinessAgain();
    const staffHasEdit = await hasPermissionAgain(staffContext, "quotations.edit");

    expect(managerHasEdit).toBe(true);
    expect(staffHasEdit).toBe(true);
  });

  it("staff-tier requirePermission never throws for a permission it lacks reports.view for, but rejects users.manage and organization.manage", async () => {
    const { requirePermission } = await import("@/lib/auth/permissions");
    const { ForbiddenError } = await import("@/lib/auth/errors");
    const { plainStaff } = await setupOrg();
    await mockedAuthAs(plainStaff.authProviderId);

    await expect(requirePermission("quotations.view")).resolves.toBeDefined();
    await expect(requirePermission("users.manage")).rejects.toThrow(ForbiddenError);
    await expect(requirePermission("organization.manage")).rejects.toThrow(
      ForbiddenError,
    );
  });
});
