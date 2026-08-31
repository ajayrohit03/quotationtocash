import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// POST /api/documents/[id]/payments and .../payments/reverse-last — the
// mark-paid/mark-unpaid replacement. See docs/payment-tracking-design.md.
// Real DB, only the Clerk/Next request-context seam mocked, same pattern
// as the rest of this test suite.
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

async function createUser(name = "Payments Test User") {
  const user = await prisma.user.create({
    data: {
      email: `payments-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_payments_test_${randomUUID()}`,
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
      name: `Payments Test Co ${randomUUID()}`,
      slug: `payments-test-${randomUUID()}`,
      email: `payments-test-biz-${randomUUID()}@example.invalid`,
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

  async function makeInvoice(status: string, total: number, amountPaid = 0) {
    return prisma.document.create({
      data: {
        businessId: business.id,
        type: "invoice",
        number: `PAY-${randomUUID().slice(0, 8)}`,
        customerId: customer.id,
        issueDate: new Date(),
        createdByUserId: owner.id,
        status,
        total,
        amountPaid,
        customerSnapshot: {},
        businessSnapshot: {},
      },
    });
  }

  return { business, customer, owner, makeInvoice };
}

async function recordPayment(
  invoiceId: string,
  body: { amount: number; paidAt?: string; note?: string },
) {
  const { POST } = await import("@/app/api/documents/[id]/payments/route");
  return POST(
    new NextRequest(`http://localhost/api/documents/${invoiceId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: invoiceId }) },
  );
}

async function reverseLast(invoiceId: string) {
  const { POST } = await import(
    "@/app/api/documents/[id]/payments/reverse-last/route"
  );
  return POST(
    new NextRequest(
      `http://localhost/api/documents/${invoiceId}/payments/reverse-last`,
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: invoiceId }) },
  );
}

describe("POST /api/documents/[id]/payments", () => {
  it("rejects recording a payment on a draft invoice", async () => {
    const { owner, makeInvoice } = await setupOrg();
    const invoice = await makeInvoice("draft", 100);
    await mockedAuthAs(owner.authProviderId);

    const response = await recordPayment(invoice.id, { amount: 50 });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("rejects recording a payment on a cancelled invoice", async () => {
    const { owner, makeInvoice } = await setupOrg();
    const invoice = await makeInvoice("cancelled", 100);
    await mockedAuthAs(owner.authProviderId);

    const response = await recordPayment(invoice.id, { amount: 50 });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("a partial payment moves status to partially_paid", async () => {
    const { owner, makeInvoice } = await setupOrg();
    const invoice = await makeInvoice("sent", 100);
    await mockedAuthAs(owner.authProviderId);

    const response = await recordPayment(invoice.id, { amount: 40, note: "Advance" });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.document.status).toBe("partially_paid");
    expect(Number(body.document.amountPaid)).toBe(40);
    expect(body.payment.note).toBe("Advance");
  });

  it("a payment covering the full remaining balance moves status to paid", async () => {
    const { owner, makeInvoice } = await setupOrg();
    const invoice = await makeInvoice("sent", 100);
    await mockedAuthAs(owner.authProviderId);

    const response = await recordPayment(invoice.id, { amount: 100 });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.document.status).toBe("paid");
    expect(Number(body.document.amountPaid)).toBe(100);
  });

  it("allows overpayment and still resolves to paid — the excess is a credit balance, not rejected", async () => {
    const { owner, makeInvoice } = await setupOrg();
    const invoice = await makeInvoice("sent", 100);
    await mockedAuthAs(owner.authProviderId);

    const response = await recordPayment(invoice.id, { amount: 150 });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.document.status).toBe("paid");
    expect(Number(body.document.amountPaid)).toBe(150);
    // creditBalance = amountPaid - total, computed by the caller — the
    // route itself just needs to have not rejected or truncated it.
    expect(Number(body.document.amountPaid) - Number(body.document.total)).toBe(50);
  });

  it("accumulates multiple payments toward the same invoice", async () => {
    const { owner, makeInvoice } = await setupOrg();
    const invoice = await makeInvoice("sent", 100);
    await mockedAuthAs(owner.authProviderId);

    await recordPayment(invoice.id, { amount: 30 });
    const second = await recordPayment(invoice.id, { amount: 70 });
    const body = await second.json();
    expect(body.document.status).toBe("paid");
    expect(Number(body.document.amountPaid)).toBe(100);

    const payments = await prisma.payment.findMany({
      where: { invoiceId: invoice.id },
    });
    expect(payments).toHaveLength(2);
  });
});

describe("POST /api/documents/[id]/payments/reverse-last", () => {
  it("rejects reversing when there are no payments", async () => {
    const { owner, makeInvoice } = await setupOrg();
    const invoice = await makeInvoice("sent", 100);
    await mockedAuthAs(owner.authProviderId);

    const response = await reverseLast(invoice.id);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("reverses the most recent payment, recomputes status, and leaves a trace note", async () => {
    const { owner, makeInvoice } = await setupOrg();
    const invoice = await makeInvoice("sent", 100);
    await mockedAuthAs(owner.authProviderId);

    await recordPayment(invoice.id, { amount: 100 });
    const response = await reverseLast(invoice.id);
    expect(response.status).toBe(200);
    const body = await response.json();

    // Resolves to "sent", not "draft" — the redesign's core departure
    // from tonight's shipped mark-unpaid.
    expect(body.document.status).toBe("sent");
    expect(Number(body.document.amountPaid)).toBe(0);
    expect(body.document.notes).toContain("Payment of");
    expect(body.document.notes).toContain("reversed by Owner User on");

    const payments = await prisma.payment.findMany({
      where: { invoiceId: invoice.id },
    });
    expect(payments).toHaveLength(0);
  });

  it("reversing a payment that created a credit balance unwinds the credit too", async () => {
    const { owner, makeInvoice } = await setupOrg();
    const invoice = await makeInvoice("sent", 100);
    await mockedAuthAs(owner.authProviderId);

    await recordPayment(invoice.id, { amount: 150 }); // paid, ₹50 credit
    const response = await reverseLast(invoice.id);
    const body = await response.json();

    expect(body.document.status).toBe("sent");
    expect(Number(body.document.amountPaid)).toBe(0);
    // creditBalance = max(0, amountPaid - total) — with amountPaid back
    // to 0, the credit is gone in the same step, no separate unwind logic.
    expect(Math.max(0, Number(body.document.amountPaid) - Number(body.document.total))).toBe(0);
  });

  it("reversing one of several payments only removes the most recent one", async () => {
    const { owner, makeInvoice } = await setupOrg();
    const invoice = await makeInvoice("sent", 100);
    await mockedAuthAs(owner.authProviderId);

    await recordPayment(invoice.id, { amount: 30 });
    await recordPayment(invoice.id, { amount: 40 });
    const response = await reverseLast(invoice.id);
    const body = await response.json();

    expect(body.document.status).toBe("partially_paid");
    expect(Number(body.document.amountPaid)).toBe(30);

    const remaining = await prisma.payment.findMany({
      where: { invoiceId: invoice.id },
    });
    expect(remaining).toHaveLength(1);
    expect(Number(remaining[0].amount)).toBe(30);
  });
});
