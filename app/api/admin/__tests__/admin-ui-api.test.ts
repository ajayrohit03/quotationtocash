import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Admin UI auth + cookie path on the plan route + businesses list.
vi.mock("server-only", () => ({}));

const PASSWORD = "ui-api-test-password-0123456789";
const HOST = "admin.example.test";
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

async function makeBusiness(name = "UI API Test") {
  const b = await prisma.business.create({
    data: { name, slug: `ui-api-${randomUUID()}`, email: "ui@example.invalid" },
  });
  businessIds.push(b.id);
  return b;
}

function req(url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  return new NextRequest(`http://${HOST}${url}`, {
    method: init.method ?? "GET",
    headers: { host: HOST, "x-forwarded-for": ip, "content-type": "application/json", ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function login(password = PASSWORD) {
  const { POST } = await import("../auth/verify/route");
  return POST(req("/api/admin/auth/verify", { method: "POST", body: { password } }));
}

async function sessionCookie(): Promise<string> {
  const res = await login();
  return `admin_session=${res.cookies.get("admin_session")!.value}`;
}

async function postPlan(id: string, headers: Record<string, string>, body: unknown = { plan: "growth" }) {
  const { POST } = await import("../businesses/[id]/plan/route");
  return POST(req(`/api/admin/businesses/${id}/plan`, { method: "POST", headers, body }), {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/admin/auth/verify", () => {
  it("sets a secure-by-default httpOnly SameSite=Strict 24h cookie on the right password", async () => {
    const res = await login();
    expect(res.status).toBe(200);
    const cookie = res.cookies.get("admin_session");
    expect(cookie?.value).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.path).toBe("/");
    expect(cookie?.maxAge).toBe(86400);
  });

  it("rejects a wrong password with 401 and sets no cookie", async () => {
    const res = await login("wrong-password");
    expect(res.status).toBe(401);
    expect(res.cookies.get("admin_session")).toBeUndefined();
  });

  it("rejects malformed bodies with 400 and rate limits repeated guesses", async () => {
    const { POST } = await import("../auth/verify/route");
    expect((await POST(req("/api/admin/auth/verify", { method: "POST", body: { nope: 1 } }))).status).toBe(400);
    // Fixed one-minute windows can reset mid-loop; allow enough attempts.
    const statuses: number[] = [];
    for (let i = 0; i < 45 && !statuses.includes(429); i++) statuses.push((await login("wrong")).status);
    expect(statuses).toContain(429);
  });

  it("fails closed when ADMIN_PASSWORD is unset", async () => {
    delete process.env.ADMIN_PASSWORD;
    expect((await login("anything")).status).toBe(401);
  });
});

describe("POST /api/admin/auth/logout", () => {
  it("clears the cookie", async () => {
    const { POST } = await import("../auth/logout/route");
    const res = await POST();
    expect(res.cookies.get("admin_session")?.value).toBe("");
    expect(res.cookies.get("admin_session")?.maxAge).toBe(0);
  });
});

describe("plan route — cookie auth", () => {
  it("accepts a valid session cookie from the same origin", async () => {
    const b = await makeBusiness();
    const res = await postPlan(b.id, { cookie: await sessionCookie(), origin: `http://${HOST}` });
    expect(res.status).toBe(200);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: b.id } })).plan).toBe("growth");
  });

  it("rejects cookie-authenticated writes with a missing or foreign Origin (403)", async () => {
    const b = await makeBusiness();
    const cookie = await sessionCookie();
    expect((await postPlan(b.id, { cookie })).status).toBe(403);
    expect((await postPlan(b.id, { cookie, origin: "https://evil.example" })).status).toBe(403);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: b.id } })).plan).toBe("free");
  });

  it("rejects tampered, expired, and garbage cookies with 401", async () => {
    const b = await makeBusiness();
    const good = (await sessionCookie()).replace("admin_session=", "");
    const [ts, sig] = good.split(".");
    const expired = `${Date.now() - 25 * 60 * 60 * 1000}.${sig}`;
    for (const value of [`${ts}.${"0".repeat(64)}`, expired, "garbage", ""]) {
      const res = await postPlan(b.id, { cookie: `admin_session=${value}`, origin: `http://${HOST}` });
      expect(res.status).toBe(401);
    }
  });

  it("still accepts the Bearer password (no cookie, no Origin needed)", async () => {
    const b = await makeBusiness();
    expect((await postPlan(b.id, { authorization: `Bearer ${PASSWORD}` })).status).toBe(200);
  });
});

describe("GET /api/admin/businesses", () => {
  it("requires admin auth", async () => {
    const { GET } = await import("../businesses/route");
    expect((await GET(req("/api/admin/businesses"))).status).toBe(401);
  });

  it("lists businesses with usage stats, filtered by name", async () => {
    const { GET } = await import("../businesses/route");
    const unique = `Zq${randomUUID().slice(0, 8)}`;
    const b = await makeBusiness(`${unique} Traders`);
    await makeBusiness("Someone Else");

    const res = await GET(req(`/api/admin/businesses?q=${unique.toLowerCase()}`, { headers: { cookie: await sessionCookie() } }));
    expect(res.status).toBe(200);
    const { businesses } = await res.json();
    expect(businesses).toHaveLength(1);
    expect(businesses[0]).toMatchObject({
      id: b.id,
      plan: "free",
      stats: { invoices: 0, quotations: 0, purchaseInvoices: 0, vendors: 0, members: 0, lastActiveAt: null },
    });
  });
});

describe("POST /api/admin/businesses/[id]/internal", () => {
  async function postInternal(id: string, headers: Record<string, string>, body: unknown) {
    const { POST } = await import("../businesses/[id]/internal/route");
    return POST(req(`/api/admin/businesses/${id}/internal`, { method: "POST", headers, body }), {
      params: Promise.resolve({ id }),
    });
  }

  it("requires admin auth", async () => {
    const b = await makeBusiness();
    expect((await postInternal(b.id, {}, { isInternal: true })).status).toBe(401);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: b.id } })).isInternal).toBe(false);
  });

  it("toggles isInternal on and off", async () => {
    const b = await makeBusiness();
    const headers = { cookie: await sessionCookie(), origin: `http://${HOST}` };
    expect((await postInternal(b.id, headers, { isInternal: true })).status).toBe(200);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: b.id } })).isInternal).toBe(true);
    expect((await postInternal(b.id, headers, { isInternal: false })).status).toBe(200);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: b.id } })).isInternal).toBe(false);
  });

  it("rejects bad bodies (400) and unknown businesses (404)", async () => {
    const b = await makeBusiness();
    const headers = { authorization: `Bearer ${PASSWORD}` };
    expect((await postInternal(b.id, headers, { isInternal: "yes" })).status).toBe(400);
    expect((await postInternal(b.id, headers, { isInternal: true, extra: 1 })).status).toBe(400);
    expect((await postInternal(randomUUID(), headers, { isInternal: true })).status).toBe(404);
  });

  it("is reflected in the admin list's isInternal flag", async () => {
    const { GET } = await import("../businesses/route");
    const unique = `Zi${randomUUID().slice(0, 8)}`;
    const b = await makeBusiness(`${unique} Co`);
    await postInternal(b.id, { authorization: `Bearer ${PASSWORD}` }, { isInternal: true });
    const res = await GET(req(`/api/admin/businesses?q=${unique.toLowerCase()}`, { headers: { cookie: await sessionCookie() } }));
    expect((await res.json()).businesses[0].isInternal).toBe(true);
  });
});
