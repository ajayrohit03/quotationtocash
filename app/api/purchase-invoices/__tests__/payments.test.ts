import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// POST /api/purchase-invoices/[id]/payments and .../payments/reverse-last
// — Stage (c) of the AP design (docs/accounts-payable-phase1-design.md
// §7). Real DB, only the Clerk/Next request-context seam mocked, same
// pattern as app/api/purchase-invoices/__tests__/purchase-invoices.test.ts.
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

async function createUser(name = "Vendor Payment Test User") {
  const user = await prisma.user.create({
    data: {
      email: `vendor-payment-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_vendor_payment_test_${randomUUID()}`,
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
      name: `Vendor Payment Test Co ${randomUUID()}`,
      slug: `vendor-payment-test-${randomUUID()}`,
      email: `vendor-payment-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const vendor = await prisma.vendor.create({
    data: { businessId: business.id, name: "Pacific Ocean Logistics" },
  });

  const owner = await createUser("Owner User");
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, role: "owner" },
  });

  const staff = await createUser("Staff User");
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: staff.id, role: "staff" },
  });

  async function makePurchaseInvoice(
    status: "received" | "approved" | "partially_paid" | "paid" | "cancelled",
    total: number,
    amountPaid = 0,
  ) {
    return prisma.purchaseInvoice.create({
      data: {
        businessId: business.id,
        vendorId: vendor.id,
        vendorInvoiceNumber: `POL-${randomUUID().slice(0, 8)}`,
        vendorInvoiceDate: new Date(),
        status,
        total,
        amountPaid,
        createdByUserId: owner.id,
        vendorSnapshot: {},
        businessSnapshot: {},
      },
    });
  }

  return { business, vendor, owner, staff, makePurchaseInvoice };
}

async function recordPayment(id: string, body: unknown) {
  const { POST } = await import("@/app/api/purchase-invoices/[id]/payments/route");
  return POST(
    new NextRequest(`http://localhost/api/purchase-invoices/${id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function reverseLastPayment(id: string) {
  const { POST } = await import(
    "@/app/api/purchase-invoices/[id]/payments/reverse-last/route"
  );
  return POST(
    new NextRequest(`http://localhost/api/purchase-invoices/${id}/payments/reverse-last`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("POST /api/purchase-invoices/[id]/payments", () => {
  it("records a partial payment and derives partially_paid", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("approved", 1000);
    await mockedAuthAs(owner.authProviderId);

    const response = await recordPayment(pi.id, { amount: 400 });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.purchaseInvoice.status).toBe("partially_paid");
    expect(body.purchaseInvoice.amountPaid).toBe("400");
    expect(body.payment.amount).toBe("400");
  });

  it("records a full payment and derives paid", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("approved", 1000);
    await mockedAuthAs(owner.authProviderId);

    const response = await recordPayment(pi.id, { amount: 1000 });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.purchaseInvoice.status).toBe("paid");
  });

  it("allows an overpayment, tracked as a credit balance rather than rejected", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("approved", 1000);
    await mockedAuthAs(owner.authProviderId);

    const response = await recordPayment(pi.id, { amount: 1200 });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.purchaseInvoice.status).toBe("paid");
    expect(body.purchaseInvoice.amountPaid).toBe("1200");
  });

  it("rejects recording a payment on a received (unapproved) invoice", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("received", 1000);
    await mockedAuthAs(owner.authProviderId);

    const response = await recordPayment(pi.id, { amount: 100 });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("rejects recording a payment on a cancelled invoice", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("cancelled", 1000);
    await mockedAuthAs(owner.authProviderId);

    const response = await recordPayment(pi.id, { amount: 100 });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("staff is forbidden from recording a payment — purchase_invoices.pay is owner/admin only", async () => {
    const { staff, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("approved", 1000, 0);
    await mockedAuthAs(staff.authProviderId);

    const response = await recordPayment(pi.id, { amount: 100 });
    expect(response.status).toBe(403);
  });

  it("rejects a non-positive amount", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("approved", 1000);
    await mockedAuthAs(owner.authProviderId);

    const response = await recordPayment(pi.id, { amount: 0 });
    expect(response.status).toBe(400);
  });
});

describe("POST /api/purchase-invoices/[id]/payments/reverse-last", () => {
  it("reverses the most recent payment and recomputes status", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("approved", 1000);
    await mockedAuthAs(owner.authProviderId);

    await recordPayment(pi.id, { amount: 400 });
    const secondPayment = await recordPayment(pi.id, { amount: 600 });
    expect((await secondPayment.json()).purchaseInvoice.status).toBe("paid");

    const response = await reverseLastPayment(pi.id);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.purchaseInvoice.status).toBe("partially_paid");
    expect(body.purchaseInvoice.amountPaid).toBe("400");

    // A trace note is left, same as the sales-side reversal route.
    expect(body.purchaseInvoice.notes).toContain("reversed by");
  });

  it("reverses back to approved once the only payment is undone", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("partially_paid", 1000, 400);
    await prisma.vendorPayment.create({
      data: {
        purchaseInvoiceId: pi.id,
        amount: 400,
        paidAt: new Date(),
        recordedByUserId: owner.id,
      },
    });
    await mockedAuthAs(owner.authProviderId);

    const response = await reverseLastPayment(pi.id);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.purchaseInvoice.status).toBe("approved");
    expect(body.purchaseInvoice.amountPaid).toBe("0");
  });

  it("400s when there is nothing to reverse", async () => {
    const { owner, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("approved", 1000);
    await mockedAuthAs(owner.authProviderId);

    const response = await reverseLastPayment(pi.id);
    expect(response.status).toBe(400);
  });

  it("staff is forbidden from reversing a payment", async () => {
    const { owner, staff, makePurchaseInvoice } = await setupOrg();
    const pi = await makePurchaseInvoice("approved", 1000);
    await mockedAuthAs(owner.authProviderId);
    await recordPayment(pi.id, { amount: 400 });

    await mockedAuthAs(staff.authProviderId);
    const response = await reverseLastPayment(pi.id);
    expect(response.status).toBe(403);
  });
});
