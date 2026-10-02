import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Real DB; only server-only is stubbed. Admin path never touches Clerk.
vi.mock("server-only", () => ({}));

const PASSWORD = "test-admin-password-0123456789";
const businessIds: string[] = [];
let ip: string;

beforeEach(() => {
  process.env.ADMIN_PASSWORD = PASSWORD;
  ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
});

afterEach(async () => {
  await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
  businessIds.length = 0;
  await prisma.rateLimitHit.deleteMany({ where: { bucketKey: `admin:${ip}` } });
});

async function makeBusiness() {
  const b = await prisma.business.create({
    data: { name: "Plan Test", slug: `plan-test-${randomUUID()}`, email: "plan@example.invalid" },
  });
  businessIds.push(b.id);
  return b;
}

async function call(id: string, body: unknown, auth: string | null = `Bearer ${PASSWORD}`) {
  const { POST } = await import("../businesses/[id]/plan/route");
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": ip };
  if (auth !== null) headers.authorization = auth;
  const req = new NextRequest(`http://localhost/api/admin/businesses/${id}/plan`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ id }) });
}

describe("POST /api/admin/businesses/[id]/plan — auth", () => {
  it("rejects missing, wrong-scheme, and wrong credentials identically with 401", async () => {
    const b = await makeBusiness();
    for (const auth of [null, "Basic abc", `Bearer wrong-${PASSWORD}`, "Bearer "]) {
      const res = await call(b.id, { plan: "growth" }, auth);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    }
    const after = await prisma.business.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.plan).toBe("free");
  });

  it("fails closed when ADMIN_PASSWORD is unset or too short", async () => {
    const b = await makeBusiness();
    delete process.env.ADMIN_PASSWORD;
    expect((await call(b.id, { plan: "growth" }, "Bearer anything")).status).toBe(401);
    process.env.ADMIN_PASSWORD = "short";
    expect((await call(b.id, { plan: "growth" }, "Bearer short")).status).toBe(401);
  });

  it("rate limits repeated attempts from one IP", async () => {
    const b = await makeBusiness();
    let last = 0;
    for (let i = 0; i < 22; i++) {
      last = (await call(b.id, { plan: "growth" }, "Bearer nope")).status;
    }
    expect(last).toBe(429);
  });
});

describe("POST /api/admin/businesses/[id]/plan — writes", () => {
  it("sets plan, note, overrides, timestamp and actor", async () => {
    const b = await makeBusiness();
    const res = await call(b.id, {
      plan: "growth",
      note: "Upgraded per email",
      planOverrides: { einvoicing: true, jobs_pnl: false },
      updatedBy: "ops-1",
    });
    expect(res.status).toBe(200);
    const row = await prisma.business.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.plan).toBe("growth");
    expect(row.planNote).toBe("Upgraded per email");
    expect(row.planOverrides).toEqual({ einvoicing: true, jobs_pnl: false });
    expect(row.planUpdatedAt).toBeInstanceOf(Date);
    expect(row.planUpdatedByUserId).toBe("ops-1");
  });

  it("omitted note/overrides are left unchanged; null overrides clears", async () => {
    const b = await makeBusiness();
    await call(b.id, { plan: "starter", note: "first", planOverrides: { vendors: true } });
    await call(b.id, { plan: "growth" });
    let row = await prisma.business.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.plan).toBe("growth");
    expect(row.planNote).toBe("first");
    expect(row.planOverrides).toEqual({ vendors: true });
    await call(b.id, { plan: "growth", planOverrides: null });
    row = await prisma.business.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.planOverrides).toBeNull();
  });

  it("rejects unknown override keys, bad plan, extra fields — and stores nothing", async () => {
    const b = await makeBusiness();
    for (const body of [
      { plan: "growth", planOverrides: { not_a_feature: true } },
      { plan: "growth", planOverrides: { jobs_pnl: "yes" } },
      { plan: "platinum" },
      { plan: "growth", extra: 1 },
    ]) {
      expect((await call(b.id, body)).status).toBe(400);
    }
    const row = await prisma.business.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.plan).toBe("free");
    expect(row.planUpdatedAt).toBeNull();
  });

  it("404s for an unknown business", async () => {
    expect((await call(randomUUID(), { plan: "growth" })).status).toBe(404);
  });
});
