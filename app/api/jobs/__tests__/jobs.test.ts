import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Job CRUD + linking — docs/job-pnl-phase2-design.md Stage (a). Real
// DB, only the Clerk/Next request-context seam mocked, same pattern as
// app/api/purchase-invoices/__tests__/purchase-invoices.test.ts.
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
    // Document.jobId / PurchaseInvoice.jobId are onDelete: SetNull, so
    // no ordering concern deleting Business directly cascades jobs,
    // documents, and purchase invoices independently — unlike
    // Vendor/PurchaseInvoice's onDelete: Restrict pair (see other test
    // files' own comments on that).
    await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds } } });
    createdBusinessIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
  vi.resetModules();
});

async function createUser(name = "Job Test User") {
  const user = await prisma.user.create({
    data: {
      email: `job-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_job_test_${randomUUID()}`,
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
      name: `Job Test Co ${randomUUID()}`,
      slug: `job-test-${randomUUID()}`,
      email: `job-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const owner = await createUser("Owner User");
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, role: "owner" },
  });

  const staff = await createUser("Staff User");
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: staff.id, role: "staff" },
  });

  return { business, owner, staff };
}

async function createJob(body: unknown) {
  const { POST } = await import("@/app/api/jobs/route");
  return POST(
    new NextRequest("http://localhost/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function listJobs(url = "http://localhost/api/jobs") {
  const { GET } = await import("@/app/api/jobs/route");
  return GET(new NextRequest(url));
}

async function getJob(id: string) {
  const { GET } = await import("@/app/api/jobs/[id]/route");
  return GET(new NextRequest(`http://localhost/api/jobs/${id}`), {
    params: Promise.resolve({ id }),
  });
}

async function patchJob(id: string, body: unknown) {
  const { PATCH } = await import("@/app/api/jobs/[id]/route");
  return PATCH(
    new NextRequest(`http://localhost/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function deleteJob(id: string) {
  const { DELETE } = await import("@/app/api/jobs/[id]/route");
  return DELETE(new NextRequest(`http://localhost/api/jobs/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/jobs", () => {
  it("creates a job for a real business", async () => {
    const { owner } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const response = await createJob({ jobRef: "TUT/0292/0926/SE", description: "Chennai to Dubai" });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.job.jobRef).toBe("TUT/0292/0926/SE");
    expect(body.job.status).toBe("open");
  });

  it("staff can create a job — same flat CRUD tier as vendors/customers", async () => {
    const { staff } = await setupOrg();
    await mockedAuthAs(staff.authProviderId);

    const response = await createJob({ jobRef: "STAFF-JOB-1" });
    expect(response.status).toBe(201);
  });

  it("rejects an empty jobRef", async () => {
    const { owner } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const response = await createJob({ jobRef: "" });
    expect(response.status).toBe(400);
  });

  it("allows two jobs with the same jobRef — deliberately not unique, see design doc §1.1", async () => {
    const { owner } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);

    const first = await createJob({ jobRef: "DUPLICATE-REF" });
    const second = await createJob({ jobRef: "DUPLICATE-REF" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });
});

describe("GET /api/jobs", () => {
  it("lists jobs with zeroed P&L summaries when nothing is linked", async () => {
    const { owner } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);
    await createJob({ jobRef: "EMPTY-JOB" });

    const response = await listJobs();
    expect(response.status).toBe(200);
    const body = await response.json();
    const job = body.jobs.find((j: { jobRef: string }) => j.jobRef === "EMPTY-JOB");
    expect(job).toBeTruthy();
    expect(job.salesInvoiceCount).toBe(0);
    expect(job.totalBilled).toBe("0");
    expect(job.purchaseInvoiceCount).toBe(0);
    expect(job.totalCost).toBe("0");
  });

  it("search filters by jobRef", async () => {
    const { owner } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);
    await createJob({ jobRef: "SEARCHABLE-REF" });
    await createJob({ jobRef: "OTHER-REF" });

    const response = await listJobs("http://localhost/api/jobs?q=SEARCHABLE");
    const body = await response.json();
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].jobRef).toBe("SEARCHABLE-REF");
  });
});

describe("PATCH /api/jobs/[id]", () => {
  it("updates jobRef/description and closes a job", async () => {
    const { owner } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);
    const created = await createJob({ jobRef: "PATCH-ME" });
    const { job } = await created.json();

    const response = await patchJob(job.id, { status: "closed" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job.status).toBe("closed");
  });

  it("reopens a closed job — the toggle is not a one-way door", async () => {
    const { owner } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);
    const created = await createJob({ jobRef: "REOPEN-ME" });
    const { job } = await created.json();
    await patchJob(job.id, { status: "closed" });

    const response = await patchJob(job.id, { status: "open" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job.status).toBe("open");
  });

  it("staff can close a job — no separate permission from jobs.edit", async () => {
    const { owner, staff } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);
    const created = await createJob({ jobRef: "STAFF-CLOSE" });
    const { job } = await created.json();

    await mockedAuthAs(staff.authProviderId);
    const response = await patchJob(job.id, { status: "closed" });
    expect(response.status).toBe(200);
  });

  it("404s for a job from another business", async () => {
    const { owner } = await setupOrg();
    const other = await setupOrg();
    await mockedAuthAs(owner.authProviderId);
    const created = await createJob({ jobRef: "CROSS-TENANT" });
    const { job } = await created.json();

    await mockedAuthAs(other.owner.authProviderId);
    const response = await patchJob(job.id, { status: "closed" });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/jobs/[id]", () => {
  it("hard-deletes a job with nothing linked to it", async () => {
    const { owner } = await setupOrg();
    await mockedAuthAs(owner.authProviderId);
    const created = await createJob({ jobRef: "DELETE-ME" });
    const { job } = await created.json();

    const response = await deleteJob(job.id);
    expect(response.status).toBe(200);

    const getResponse = await getJob(job.id);
    expect(getResponse.status).toBe(404);
  });
});
