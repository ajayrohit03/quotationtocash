import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// PATCH /api/documents/[id] — "Round total" (roundTotal/roundingAdjustment)
// and showDiscount. Real DB, only the Clerk/Next request-context seam
// mocked, same pattern as the rest of this test suite (see
// multi-currency.test.ts).
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
      email: `rounding-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_rounding_test_${randomUUID()}`,
      name: "Rounding Test User",
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
      name: `Rounding Test Co ${randomUUID()}`,
      slug: `rounding-test-${randomUUID()}`,
      email: `rounding-test-biz-${randomUUID()}@example.invalid`,
      gstEnabled: true,
      gstDefaultRate: 18,
      placeOfSupply: "Maharashtra",
    },
  });
  createdBusinessIds.push(business.id);

  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Test Customer", state: "Maharashtra" },
  });

  const owner = await createUser();
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, role: "owner" },
  });

  const document = await prisma.document.create({
    data: {
      businessId: business.id,
      type: "invoice",
      number: `RND-${randomUUID().slice(0, 8)}`,
      customerId: customer.id,
      issueDate: new Date(),
      createdByUserId: owner.id,
      customerSnapshot: {},
      businessSnapshot: {},
    },
  });

  return { business, owner, document };
}

function patchRequest(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/documents/[id] — Round total", () => {
  it("leaves total untouched and roundingAdjustment at 0 when roundTotal is off", async () => {
    const { owner, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    // qty*rate=1013.71, +18% GST = 1196.17 -> taxableAmount 1013.71,
    // total 1196.17 after the tax engine's own 2dp rounding.
    const response = await PATCH(
      patchRequest(document.id, {
        lineItems: [{ name: "Line", qty: 1, rate: 1013.71, gstRate: 18 }],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Number(body.document.total)).toBe(1196.17);
    expect(Number(body.document.roundingAdjustment)).toBe(0);
    expect(body.document.roundTotal).toBe(false);
  });

  it("rounds the total and persists a negative roundingAdjustment when enabled together with line items", async () => {
    const { owner, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    const response = await PATCH(
      patchRequest(document.id, {
        roundTotal: true,
        lineItems: [{ name: "Line", qty: 1, rate: 1013.71, gstRate: 18 }],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    // 1196.17 -> tax-engine-rounded taxableAmount/cgst/sgst still sum
    // to 1196.17 pre-rounding; Math.round(1196.17) = 1196.
    expect(Number(body.document.total)).toBe(1196);
    expect(Number(body.document.roundingAdjustment)).toBeCloseTo(-0.17, 5);
    expect(body.document.roundTotal).toBe(true);

    // The underlying tax calculation itself is untouched by rounding.
    expect(Number(body.document.taxableAmount)).toBe(1013.71);
    expect(Number(body.document.cgst)).toBe(91.23);
    expect(Number(body.document.sgst)).toBe(91.23);
  });

  it("recomputes total/roundingAdjustment when the toggle changes on its own, with no lineItems in the request", async () => {
    const { owner, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    // First save the line items with rounding off.
    await PATCH(
      patchRequest(document.id, {
        lineItems: [{ name: "Line", qty: 1, rate: 1013.71, gstRate: 18 }],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );

    // Now flip the toggle alone — the Customize sidebar's autosave
    // pattern (appearance-only PATCH, no lineItems in the body at all).
    const response = await PATCH(
      patchRequest(document.id, { roundTotal: true }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Number(body.document.total)).toBe(1196);
    expect(Number(body.document.roundingAdjustment)).toBeCloseTo(-0.17, 5);

    // Flipping it back off restores the exact pre-rounding total.
    const response2 = await PATCH(
      patchRequest(document.id, { roundTotal: false }),
      { params: Promise.resolve({ id: document.id }) },
    );
    const body2 = await response2.json();
    expect(Number(body2.document.total)).toBe(1196.17);
    expect(Number(body2.document.roundingAdjustment)).toBe(0);
  });

  it("is a no-op adjustment when the raw total is already a whole number", async () => {
    const { owner, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    const response = await PATCH(
      patchRequest(document.id, {
        roundTotal: true,
        lineItems: [{ name: "Line", qty: 1, rate: 1000, gstRate: 18 }],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    const body = await response.json();
    expect(Number(body.document.total)).toBe(1180);
    expect(Number(body.document.roundingAdjustment)).toBe(0);
  });
});

describe("PATCH /api/documents/[id] — showDiscount", () => {
  it("persists showDiscount independently of the discount calculation itself", async () => {
    const { owner, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    const response = await PATCH(
      patchRequest(document.id, {
        showDiscount: false,
        lineItems: [
          { name: "Line", qty: 1, rate: 1000, discountPct: 10, gstRate: 18 },
        ],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.document.showDiscount).toBe(false);
    // The discount is still fully computed and stored — only its display
    // is toggled off.
    expect(Number(body.document.discountTotal)).toBe(100);
  });

  it("defaults to true for a document that never sets it", async () => {
    const { owner, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const saved = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(saved.showDiscount).toBe(true);
  });
});
