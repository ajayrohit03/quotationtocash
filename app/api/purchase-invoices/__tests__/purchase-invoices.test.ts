import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Real DB, only the Clerk/Next request-context seam mocked — same
// pattern as app/api/documents/__tests__/finalize.test.ts.
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
    // PurchaseInvoice.vendorId is onDelete: Restrict — must be cleared
    // before Business's cascade tries to delete a Vendor a
    // PurchaseInvoice still points at, same reasoning as
    // lib/documents/__tests__/document-snapshots.test.ts's own comment
    // on Document/Customer.
    await prisma.purchaseInvoice.deleteMany({
      where: { businessId: { in: createdBusinessIds } },
    });
    await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds } } });
    createdBusinessIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
  vi.resetModules();
});

async function createUser(name = "Purchase Invoice Test User") {
  const user = await prisma.user.create({
    data: {
      email: `pi-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_pi_test_${randomUUID()}`,
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
      name: `PI Test Co ${randomUUID()}`,
      slug: `pi-test-${randomUUID()}`,
      email: `pi-test-biz-${randomUUID()}@example.invalid`,
      gstEnabled: true,
      gstDefaultRate: 18,
      placeOfSupply: "Karnataka",
    },
  });
  createdBusinessIds.push(business.id);

  const vendor = await prisma.vendor.create({
    data: { businessId: business.id, name: "Pacific Ocean Logistics", state: "Karnataka" },
  });

  const owner = await createUser("Owner User");
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, role: "owner" },
  });

  const admin = await createUser("Admin User");
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: admin.id, role: "admin" },
  });

  const staff = await createUser("Staff User");
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: staff.id, role: "staff" },
  });

  async function makePurchaseInvoice(status: "received" | "approved" | "cancelled", createdByUserId: string = owner.id) {
    return prisma.purchaseInvoice.create({
      data: {
        businessId: business.id,
        vendorId: vendor.id,
        vendorInvoiceNumber: `POL-${randomUUID().slice(0, 8)}`,
        vendorInvoiceDate: new Date(),
        status,
        createdByUserId,
        vendorSnapshot: {},
        businessSnapshot: {},
      },
    });
  }

  return { business, vendor, owner, admin, staff, makePurchaseInvoice };
}

async function createPurchaseInvoice(body: unknown) {
  const { POST } = await import("@/app/api/purchase-invoices/route");
  return POST(
    new NextRequest("http://localhost/api/purchase-invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function patchPurchaseInvoice(id: string, body: unknown) {
  const { PATCH } = await import("@/app/api/purchase-invoices/[id]/route");
  return PATCH(
    new NextRequest(`http://localhost/api/purchase-invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function approvePurchaseInvoice(id: string) {
  const { POST } = await import("@/app/api/purchase-invoices/[id]/approve/route");
  return POST(
    new NextRequest(`http://localhost/api/purchase-invoices/${id}/approve`, { method: "POST" }),
    { params: Promise.resolve({ id }) },
  );
}

async function cancelPurchaseInvoice(id: string) {
  const { POST } = await import("@/app/api/purchase-invoices/[id]/cancel/route");
  return POST(
    new NextRequest(`http://localhost/api/purchase-invoices/${id}/cancel`, { method: "POST" }),
    { params: Promise.resolve({ id }) },
  );
}

describe("POST /api/purchase-invoices", () => {
  it("creates an empty received invoice for a real vendor", async () => {
    const { owner, vendor } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const response = await createPurchaseInvoice({ vendorId: vendor.id });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.purchaseInvoice.status).toBe("received");
    expect(body.purchaseInvoice.vendorId).toBe(vendor.id);
  });

  it("404s for a vendor from another business", async () => {
    const { owner } = await setupOrg();
    const other = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const response = await createPurchaseInvoice({ vendorId: other.vendor.id });
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/purchase-invoices/[id]", () => {
  it("saves shipment details and line items, computing tax totals correctly", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("received");
    await mockedAuthAs(owner.authProviderId);

    const response = await patchPurchaseInvoice(pi.id, {
      vendorInvoiceNumber: "POL/2026/0142",
      vendorInvoiceDate: "2026-01-15",
      containerNo: "MSCU1234567",
      lineItems: [
        { description: "Ocean Freight", qty: 1, rate: 10000, gstRate: 18 },
      ],
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.purchaseInvoice.vendorInvoiceNumber).toBe("POL/2026/0142");
    expect(body.purchaseInvoice.containerNo).toBe("MSCU1234567");
    // Same state (Karnataka vendor, Karnataka place of supply) -> CGST+SGST split.
    expect(body.purchaseInvoice.cgst).toBe("900");
    expect(body.purchaseInvoice.sgst).toBe("900");
    expect(body.purchaseInvoice.igst).toBe("0");
    expect(body.purchaseInvoice.total).toBe("11800");
  });

  it("rejects editing an approved invoice — received is the only editable status", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("approved");
    await mockedAuthAs(owner.authProviderId);

    const response = await patchPurchaseInvoice(pi.id, { vendorInvoiceNumber: "NEW-001" });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("staff can edit their own received invoice — received is not itself a lock", async () => {
    const { staff, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("received", staff.id);
    await mockedAuthAs(staff.authProviderId);

    const response = await patchPurchaseInvoice(pi.id, { vendorInvoiceNumber: "STAFF-EDIT" });
    expect(response.status).toBe(200);
  });

  it("404s for a purchase invoice outside the caller's mutate scope", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("received", owner.id);
    const otherStaff = await createUser("Other Staff");
    const business = await prisma.business.findUniqueOrThrow({ where: { id: pi.businessId } });
    await prisma.businessMember.create({
      data: { businessId: business.id, userId: otherStaff.id, role: "staff" },
    });
    await mockedAuthAs(otherStaff.authProviderId);

    const response = await patchPurchaseInvoice(pi.id, { vendorInvoiceNumber: "SHOULD-NOT-APPLY" });
    expect(response.status).toBe(404);
  });
});

describe("POST /api/purchase-invoices/[id]/approve", () => {
  it("owner can approve a received invoice", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("received");
    await mockedAuthAs(owner.authProviderId);

    const response = await approvePurchaseInvoice(pi.id);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.purchaseInvoice.status).toBe("approved");
  });

  it("admin can approve too", async () => {
    const { admin, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("received");
    await mockedAuthAs(admin.authProviderId);

    const response = await approvePurchaseInvoice(pi.id);
    expect(response.status).toBe(200);
  });

  it("staff is forbidden from approving — the financial control point design doc §8 calls for", async () => {
    const { staff, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("received", staff.id);
    await mockedAuthAs(staff.authProviderId);

    const response = await approvePurchaseInvoice(pi.id);
    expect(response.status).toBe(403);
  });

  it("rejects approving an already-approved invoice — no re-approval", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("approved");
    await mockedAuthAs(owner.authProviderId);

    const response = await approvePurchaseInvoice(pi.id);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});

describe("POST /api/purchase-invoices/[id]/cancel", () => {
  it("staff can cancel their own received invoice — purchase_invoices.edit tier, not .pay", async () => {
    const { staff, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("received", staff.id);
    await mockedAuthAs(staff.authProviderId);

    const response = await cancelPurchaseInvoice(pi.id);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.purchaseInvoice.status).toBe("cancelled");
  });

  it("can cancel an approved invoice too", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("approved");
    await mockedAuthAs(owner.authProviderId);

    const response = await cancelPurchaseInvoice(pi.id);
    expect(response.status).toBe(200);
  });

  it("is a dead end — an already-cancelled invoice can't be cancelled again", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("cancelled");
    await mockedAuthAs(owner.authProviderId);

    const response = await cancelPurchaseInvoice(pi.id);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});
