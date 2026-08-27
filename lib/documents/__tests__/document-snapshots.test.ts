import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  buildBusinessSnapshot,
  buildCustomerSnapshot,
  type CustomerSnapshot,
} from "@/lib/documents/snapshots";
import { calculateLineAmount } from "@/lib/documents/calculations";
import { calculateDocumentTotals } from "@/lib/tax/calculateDocumentTotals";
import { isSameState } from "@/lib/tax/calculateGST";
import { resolveGstRate } from "@/lib/tax/resolveGstRate";

// Regression tests for the spec rule "historical documents must not
// change when the live Customer/Business/Product rows do later." These
// exercise the actual library functions the API routes call
// (buildCustomerSnapshot, resolveGstRate, calculateDocumentTotals)
// against real rows, the same way lib/auth/__tests__/session.race.test.ts
// exercises findOrCreateUserForIdentity — not mocks.
const createdBusinessIds: string[] = [];

afterEach(async () => {
  if (createdBusinessIds.length > 0) {
    // Documents reference customers with onDelete: Restrict, so they must
    // go first — Business's cascade would otherwise try to delete a
    // Customer a Document still points at and get a FK violation.
    await prisma.document.deleteMany({
      where: { businessId: { in: createdBusinessIds } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: createdBusinessIds } },
    });
    createdBusinessIds.length = 0;
  }
});

async function createTestBusiness(
  overrides: Partial<{
    gstEnabled: boolean;
    gstDefaultRate: number;
    placeOfSupply: string;
  }> = {},
) {
  const business = await prisma.business.create({
    data: {
      name: `Snapshot Test ${randomUUID()}`,
      slug: `snapshot-test-${randomUUID()}`,
      email: `snapshot-test-${randomUUID()}@example.invalid`,
      ...overrides,
    },
  });
  createdBusinessIds.push(business.id);
  return business;
}

describe("document snapshot immutability", () => {
  it("keeps the customer snapshot unchanged after the customer's address changes", async () => {
    const business = await createTestBusiness();
    const customer = await prisma.customer.create({
      data: {
        businessId: business.id,
        name: "Original Customer",
        address: "100 Original Street",
      },
    });

    const document = await prisma.document.create({
      data: {
        businessId: business.id,
        type: "invoice",
        number: `TEST-${randomUUID()}`,
        customerId: customer.id,
        issueDate: new Date(),
        customerSnapshot: buildCustomerSnapshot(customer),
        businessSnapshot: buildBusinessSnapshot(business),
      },
    });

    // The customer moves, after the document already exists.
    await prisma.customer.update({
      where: { id: customer.id },
      data: { address: "200 New Street" },
    });

    const refetched = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    const snapshot = refetched.customerSnapshot as unknown as CustomerSnapshot;

    expect(snapshot.address).toBe("100 Original Street");

    // Confirm this isn't a vacuous pass — the live row really did change.
    const liveCustomer = await prisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(liveCustomer.address).toBe("200 New Street");
  });

  it("keeps a line item's resolved GST rate and computed tax unchanged after the product's rate changes", async () => {
    const business = await createTestBusiness({
      gstEnabled: true,
      gstDefaultRate: 5,
      placeOfSupply: "Maharashtra",
    });
    const customer = await prisma.customer.create({
      data: {
        businessId: business.id,
        name: "Test Customer",
        state: "Maharashtra",
      },
    });
    const product = await prisma.product.create({
      data: {
        businessId: business.id,
        name: "Widget",
        price: 1000,
        gstRate: 18,
      },
    });

    // Mirrors what PATCH /api/documents/:id does: resolve the rate once,
    // compute totals once, and persist both.
    const resolvedRate = resolveGstRate(null, product.gstRate, business.gstDefaultRate);
    const lineInput = { qty: 1, rate: 1000, gstRate: resolvedRate };
    const sameState = isSameState(business.placeOfSupply, customer.state);
    const totals = calculateDocumentTotals([lineInput], {
      gstEnabled: business.gstEnabled,
      sameState,
    });

    expect(resolvedRate?.toString()).toBe("18");
    expect(totals.cgst.toString()).toBe("90");
    expect(totals.sgst.toString()).toBe("90");

    const document = await prisma.document.create({
      data: {
        businessId: business.id,
        type: "invoice",
        number: `TEST-${randomUUID()}`,
        customerId: customer.id,
        issueDate: new Date(),
        customerSnapshot: buildCustomerSnapshot(customer),
        businessSnapshot: buildBusinessSnapshot(business),
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxableAmount: totals.taxableAmount,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        total: totals.total,
        lineItems: {
          create: {
            productId: product.id,
            name: product.name,
            qty: 1,
            rate: 1000,
            amount: calculateLineAmount(lineInput),
            gstRate: resolvedRate,
          },
        },
      },
    });

    // The product's rate changes later — a real scenario, e.g. a GST
    // slab revision.
    await prisma.product.update({
      where: { id: product.id },
      data: { gstRate: 28 },
    });

    const refetched = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
      include: { lineItems: true },
    });

    expect(refetched.lineItems[0].gstRate?.toString()).toBe("18");
    expect(refetched.cgst.toString()).toBe("90");
    expect(refetched.sgst.toString()).toBe("90");
    expect(refetched.total.toString()).toBe("1180");

    // Confirm this isn't a vacuous pass — the live product really did change.
    const liveProduct = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(liveProduct.gstRate?.toString()).toBe("28");
  });
});
