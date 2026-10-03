import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";

vi.mock("server-only", () => ({}));

// Real DB. getAnalytics({ now, businessIds }) confines every aggregate to
// this test's own rows (the shared DB holds other data) with a pinned clock.
const NOW = new Date("2026-10-15T06:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const businessIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  if (businessIds.length) {
    await prisma.purchaseInvoice.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.document.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    businessIds.length = 0;
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    userIds.length = 0;
  }
});

async function makeUser() {
  const user = await prisma.user.create({
    data: { email: `an-${randomUUID()}@example.invalid`, authProviderId: `user_an_${randomUUID()}`, name: "An" },
  });
  userIds.push(user.id);
  return user;
}

async function makeBusiness(opts: { name: string; plan?: "free" | "growth"; createdAt: Date; isInternal?: boolean }) {
  const b = await prisma.business.create({
    data: {
      name: opts.name,
      slug: `an-${randomUUID()}`,
      email: `an-${randomUUID()}@example.invalid`,
      plan: opts.plan ?? "free",
      createdAt: opts.createdAt,
      isInternal: opts.isInternal ?? false,
    },
  });
  businessIds.push(b.id);
  const customer = await prisma.customer.create({ data: { businessId: b.id, name: "Cust" } });
  const user = await makeUser();

  const doc = (type: "quotation" | "invoice" | "proforma", ageDays: number, currency = "INR", status = "draft") =>
    prisma.document.create({
      data: {
        businessId: b.id,
        type,
        number: `AN-${randomUUID().slice(0, 8)}`,
        customerId: customer.id,
        issueDate: daysAgo(ageDays),
        createdByUserId: user.id,
        status,
        currency,
        customerSnapshot: {},
        businessSnapshot: {},
        createdAt: daysAgo(ageDays),
        updatedAt: daysAgo(ageDays),
      },
    });

  const purchaseInvoice = async () => {
    const vendor = await prisma.vendor.create({ data: { businessId: b.id, name: "V" } });
    return prisma.purchaseInvoice.create({
      data: {
        businessId: b.id,
        vendorId: vendor.id,
        vendorInvoiceNumber: `V-${randomUUID().slice(0, 8)}`,
        vendorInvoiceDate: NOW,
        createdByUserId: user.id,
        vendorSnapshot: {},
        businessSnapshot: {},
        updatedAt: NOW,
      },
    });
  };
  const job = () => prisma.job.create({ data: { businessId: b.id, jobRef: `J-${randomUUID().slice(0, 6)}` } });
  const customField = (isActive: boolean) =>
    prisma.customFieldDefinition.create({
      data: { businessId: b.id, label: "F", type: "text", scope: "document", isActive },
    });

  return { business: b, doc, purchaseInvoice, job, customField };
}

describe("getAnalytics", () => {
  it("computes every metric to the design doc's definitions and excludes internal businesses", async () => {
    const { getAnalytics } = await import("../queries");

    const a = await makeBusiness({ name: "Alpha", plan: "growth", createdAt: new Date("2026-10-10T00:00:00Z") });
    await a.doc("invoice", 5, "INR", "draft");
    await a.doc("invoice", 5, "USD", "cancelled");
    await a.doc("quotation", 40);
    await a.doc("proforma", 5);
    await a.purchaseInvoice();
    await a.job();
    await a.customField(true);

    const b = await makeBusiness({ name: "Beta", createdAt: new Date("2026-08-20T00:00:00Z") });

    const c = await makeBusiness({ name: "Gamma", createdAt: new Date("2026-04-30T19:00:00Z") });
    await c.doc("invoice", 29);
    await c.doc("invoice", 31);
    await c.customField(false);

    const x = await makeBusiness({
      name: "Internal Co",
      plan: "growth",
      createdAt: new Date("2026-10-14T00:00:00Z"),
      isInternal: true,
    });
    await x.doc("invoice", 1, "USD");
    await x.purchaseInvoice();
    await x.job();
    await x.customField(true);

    const ids = [a, b, c, x].map((t) => t.business.id);
    const r = await getAnalytics({ now: NOW, businessIds: ids });

    expect(r.totalBusinesses).toBe(3);
    expect(r.totalDocuments).toBe(6);
    expect(r.totalInvoices).toBe(4); // drafts and cancelled count
    expect(r.activeBusinesses).toBe(2); // Alpha, Gamma(29d); Beta none; internal excluded

    expect(r.planDistribution).toEqual([
      { plan: "free", count: 2 },
      { plan: "starter", count: 0 },
      { plan: "growth", count: 1 },
      { plan: "enterprise", count: 0 },
    ]);

    expect(r.signupsByMonth.map((m) => [m.key, m.count])).toEqual([
      ["2026-05", 1], // Gamma: Apr 30 19:00 UTC is May 1 IST
      ["2026-06", 0],
      ["2026-07", 0],
      ["2026-08", 1],
      ["2026-09", 0],
      ["2026-10", 1],
    ]);

    expect(r.adoption).toEqual({ ap: 1, jobs: 1, customFields: 1, multiCurrency: 1 });

    expect(r.topBusinesses.map((t) => [t.name, t.documents])).toEqual([
      ["Alpha", 3], // quotation 40d old is outside the window
      ["Gamma", 1], // 29d inside, 31d outside
    ]);
    expect(r.recentSignups.map((s) => s.name)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("breaks top-5 ties by name and caps the list at five", async () => {
    const { getAnalytics } = await import("../queries");
    const made = [];
    for (const name of ["F", "E", "D", "C", "B", "A"]) {
      const t = await makeBusiness({ name, createdAt: daysAgo(100) });
      await t.doc("quotation", 2);
      made.push(t);
    }
    const r = await getAnalytics({ now: NOW, businessIds: made.map((t) => t.business.id) });
    expect(r.topBusinesses.map((t) => t.name)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("returns zeros and an all-zero chart for an empty scope", async () => {
    const { getAnalytics } = await import("../queries");
    const r = await getAnalytics({ now: NOW, businessIds: [randomUUID()] });
    expect(r.totalBusinesses).toBe(0);
    expect(r.activeBusinesses).toBe(0);
    expect(r.planDistribution.map((p) => p.count)).toEqual([0, 0, 0, 0]);
    expect(r.signupsByMonth).toHaveLength(6);
    expect(r.topBusinesses).toEqual([]);
    expect(r.recentSignups).toEqual([]);
  });
});
