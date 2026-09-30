import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// PurchaseInvoice.jobId — docs/job-pnl-phase2-design.md §5.2. Real DB,
// only the Clerk/Next request-context seam mocked, same pattern as
// purchase-invoices.test.ts.
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

async function createUser(name = "PI Job Linking Test User") {
  const user = await prisma.user.create({
    data: {
      email: `pi-job-linking-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_pi_job_linking_test_${randomUUID()}`,
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
      name: `PI Job Linking Test Co ${randomUUID()}`,
      slug: `pi-job-linking-test-${randomUUID()}`,
      email: `pi-job-linking-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const vendor = await prisma.vendor.create({
    data: { businessId: business.id, name: "Pacific Ocean Logistics" },
  });
  const job = await prisma.job.create({
    data: { businessId: business.id, jobRef: "TUT/0292/0926/SE" },
  });
  const owner = await createUser();
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, role: "owner" },
  });

  return { business, vendor, job, owner };
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

describe("PurchaseInvoice.jobId linking", () => {
  it("links a job at creation via a single POST", async () => {
    const { owner, vendor, job } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const response = await createPurchaseInvoice({ vendorId: vendor.id, jobId: job.id });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.purchaseInvoice.jobId).toBe(job.id);
  });

  it("links a job via PATCH after minimal creation", async () => {
    const { owner, vendor, job } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);
    const created = await createPurchaseInvoice({ vendorId: vendor.id });
    const { purchaseInvoice } = await created.json();

    const response = await patchPurchaseInvoice(purchaseInvoice.id, { jobId: job.id });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.purchaseInvoice.jobId).toBe(job.id);
  });

  it("keeps the free-text jobRef shipment field independent of jobId — no auto-sync", async () => {
    const { owner, vendor, job } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const response = await createPurchaseInvoice({
      vendorId: vendor.id,
      jobId: job.id,
      jobRef: "A completely different vendor-printed reference",
    });
    const body = await response.json();
    expect(body.purchaseInvoice.jobId).toBe(job.id);
    expect(body.purchaseInvoice.jobRef).toBe("A completely different vendor-printed reference");
  });

  it("404s for a job from another business", async () => {
    const { owner, vendor } = await setupOrg();
    const other = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const response = await createPurchaseInvoice({ vendorId: vendor.id, jobId: other.job.id });
    expect(response.status).toBe(404);
  });
});
