import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// PATCH /api/documents/[id] — LineItem multi-currency provenance fields
// (stage 4 of docs/custom-fields-and-multicurrency-design.md §1b/§2).
// Real DB, only the Clerk/Next request-context seam mocked, same
// pattern as the rest of this test suite.
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
      email: `multi-currency-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_multi_currency_test_${randomUUID()}`,
      name: "Multi Currency Test User",
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
      name: `Multi Currency Test Co ${randomUUID()}`,
      slug: `multi-currency-test-${randomUUID()}`,
      email: `multi-currency-test-biz-${randomUUID()}@example.invalid`,
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
      number: `MC-${randomUUID().slice(0, 8)}`,
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

describe("PATCH /api/documents/[id] — line item multi-currency fields", () => {
  it("persists foreignCurrency/foreignRate/exchangeRate verbatim, unrelated to rate", async () => {
    const { owner, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    const response = await PATCH(
      patchRequest(document.id, {
        lineItems: [
          {
            name: "Ocean Freight",
            qty: 1,
            // The builder already computed this client-side as
            // round(500 * 83.24671, 2) — the route trusts it verbatim,
            // exactly like every other line item field.
            rate: 41623.36,
            gstRate: 18,
            foreignCurrency: "USD",
            foreignRate: 500,
            exchangeRate: 83.24671,
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
    const item = saved.lineItems[0];
    expect(item.rate.toString()).toBe("41623.36");
    expect(item.foreignCurrency).toBe("USD");
    expect(Number(item.foreignRate)).toBe(500);
    expect(Number(item.exchangeRate)).toBe(83.24671);
  });

  it("computes tax/totals purely from rate, with zero coupling to the foreign-currency fields", async () => {
    const { owner, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");

    // Two documents, same `rate`/`qty`/`gstRate` — one with foreign-
    // currency provenance attached, one without. Totals must be
    // byte-identical regardless, proving the tax engine never reads
    // foreignCurrency/foreignRate/exchangeRate at all.
    const withForeign = await PATCH(
      patchRequest(document.id, {
        lineItems: [
          {
            name: "Line",
            qty: 2,
            rate: 1000,
            gstRate: 18,
            foreignCurrency: "USD",
            foreignRate: 12,
            exchangeRate: 83.33,
          },
        ],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    const withForeignBody = await withForeign.json();

    const { owner: owner2, document: withoutForeignDoc } = await setupOrg();
    await mockedAuthAs(owner2.authProviderId);
    const withoutForeign = await PATCH(
      patchRequest(withoutForeignDoc.id, {
        lineItems: [{ name: "Line", qty: 2, rate: 1000, gstRate: 18 }],
      }),
      { params: Promise.resolve({ id: withoutForeignDoc.id }) },
    );
    const withoutForeignBody = await withoutForeign.json();

    expect(withForeignBody.document.total).toBe(withoutForeignBody.document.total);
    expect(withForeignBody.document.cgst).toBe(withoutForeignBody.document.cgst);
    expect(withForeignBody.document.sgst).toBe(withoutForeignBody.document.sgst);
  });

  it("clears foreign-currency fields when a subsequent save omits them", async () => {
    const { owner, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const { PATCH } = await import("@/app/api/documents/[id]/route");
    await PATCH(
      patchRequest(document.id, {
        lineItems: [
          {
            name: "Line",
            qty: 1,
            rate: 500,
            foreignCurrency: "EUR",
            foreignRate: 5,
            exchangeRate: 100,
          },
        ],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );

    // Whole-array replace (same rule as lineItems generally, and as
    // customFieldValues in stage 2) — "Remove" in the builder sends the
    // line without these fields, and it must genuinely clear them.
    await PATCH(
      patchRequest(document.id, {
        lineItems: [{ name: "Line", qty: 1, rate: 500 }],
      }),
      { params: Promise.resolve({ id: document.id }) },
    );

    const saved = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
      include: { lineItems: true },
    });
    expect(saved.lineItems[0].foreignCurrency).toBeNull();
    expect(saved.lineItems[0].foreignRate).toBeNull();
    expect(saved.lineItems[0].exchangeRate).toBeNull();
  });
});
