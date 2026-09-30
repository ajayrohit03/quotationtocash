import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Document.jobId — docs/job-pnl-phase2-design.md §5.1. Real DB, only
// the Clerk/Next request-context seam mocked, same pattern as the rest
// of this test suite.
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

async function createUser(name = "Job Linking Test User") {
  const user = await prisma.user.create({
    data: {
      email: `job-linking-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_job_linking_test_${randomUUID()}`,
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
      name: `Job Linking Test Co ${randomUUID()}`,
      slug: `job-linking-test-${randomUUID()}`,
      email: `job-linking-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Test Customer" },
  });

  const job = await prisma.job.create({
    data: { businessId: business.id, jobRef: "TUT/0292/0926/SE" },
  });

  const owner = await createUser("Owner User");
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, role: "owner" },
  });

  const document = await prisma.document.create({
    data: {
      businessId: business.id,
      type: "invoice",
      number: `JOB-${randomUUID().slice(0, 8)}`,
      customerId: customer.id,
      issueDate: new Date(),
      createdByUserId: owner.id,
      status: "draft",
      customerSnapshot: {},
      businessSnapshot: {},
    },
  });

  return { business, customer, job, owner, document };
}

async function patchDocument(id: string, body: unknown) {
  const { PATCH } = await import("@/app/api/documents/[id]/route");
  return PATCH(
    new NextRequest(`http://localhost/api/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("PATCH /api/documents/[id] — jobId", () => {
  it("links a document to a job", async () => {
    const { owner, job, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const response = await patchDocument(document.id, { jobId: job.id });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.document.jobId).toBe(job.id);
  });

  it("clears a job link when explicitly sent null", async () => {
    const { owner, job, document } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);
    await patchDocument(document.id, { jobId: job.id });

    const response = await patchDocument(document.id, { jobId: null });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.document.jobId).toBeNull();
  });

  it("404s for a job from another business — never silently cross-links tenants", async () => {
    const { owner, document } = await setupOrg();
    const other = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const response = await patchDocument(document.id, { jobId: other.job.id });
    expect(response.status).toBe(404);
  });
});
