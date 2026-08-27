import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Route-level coverage for the PDF route specifically (the page uses
// next/navigation's redirect(), which throws rather than returning a
// response — awkward to assert on directly; this route returns a plain
// NextResponse, so it's the more direct place to prove the actual HTTP
// redirect happens, on top of lib/documents/__tests__/public-access.test.ts
// already proving the underlying decision logic). Real DB; "server-only"
// and next/headers are mocked — the route derives the subdomain via
// headers().get("host"), not the NextRequest object passed to the
// handler, so the mock is what actually drives each scenario here.
vi.mock("server-only", () => ({}));

const headersMock = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: headersMock }));

function mockHost(host: string | null) {
  headersMock.mockResolvedValue({
    get: (key: string) => (key === "host" ? host : null),
  });
}

const createdBusinessIds: string[] = [];

afterEach(async () => {
  if (createdBusinessIds.length > 0) {
    await prisma.business.deleteMany({
      where: { id: { in: createdBusinessIds } },
    });
    createdBusinessIds.length = 0;
  }
  vi.unstubAllEnvs();
});

async function setupDocument(slug: string) {
  const business = await prisma.business.create({
    data: {
      name: `PDF Redirect Test Co ${randomUUID()}`,
      slug,
      email: `pdf-redirect-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Test Customer" },
  });

  const shareToken = randomUUID();
  await prisma.document.create({
    data: {
      businessId: business.id,
      type: "quotation",
      number: `PDF-REDIRECT-${randomUUID().slice(0, 8)}`,
      customerId: customer.id,
      issueDate: new Date(),
      shareToken,
      customerSnapshot: {},
      businessSnapshot: {},
    },
  });

  return { business, shareToken };
}

describe("GET /public/documents/[token]/pdf — subdomain handling", () => {
  it("307s to the correct subdomain when accessed with no subdomain at all", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    const slug = `flat-pdf-${randomUUID().slice(0, 8)}`;
    const { shareToken } = await setupDocument(slug);
    mockHost("app.example.com");

    const { GET } = await import("@/app/public/documents/[token]/pdf/route");
    const request = new NextRequest(
      `http://localhost/public/documents/${shareToken}/pdf`,
    );
    const response = await GET(request, { params: Promise.resolve({ token: shareToken }) });

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain(`${slug}.`);
    expect(location).toContain(`/public/documents/${shareToken}/pdf`);
  });

  it("307s to the correct subdomain when accessed on the wrong business's subdomain", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    const slug = `right-pdf-${randomUUID().slice(0, 8)}`;
    const { shareToken } = await setupDocument(slug);
    mockHost("wrong-biz.app.example.com");

    const { GET } = await import("@/app/public/documents/[token]/pdf/route");
    const request = new NextRequest(
      `http://localhost/public/documents/${shareToken}/pdf`,
    );
    const response = await GET(request, { params: Promise.resolve({ token: shareToken }) });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(`${slug}.`);
  });

  it("200s and skips the redirect on the correct subdomain", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    const slug = `matching-pdf-${randomUUID().slice(0, 8)}`;
    const { shareToken } = await setupDocument(slug);
    mockHost(`${slug}.app.example.com`);

    const { GET } = await import("@/app/public/documents/[token]/pdf/route");
    const request = new NextRequest(
      `http://localhost/public/documents/${shareToken}/pdf`,
    );
    const response = await GET(request, { params: Promise.resolve({ token: shareToken }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });

  it("404s for a token that doesn't exist, regardless of Host", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    mockHost("whatever.app.example.com");

    const { GET } = await import("@/app/public/documents/[token]/pdf/route");
    const badToken = randomUUID();
    const request = new NextRequest(
      `http://localhost/public/documents/${badToken}/pdf`,
    );
    const response = await GET(request, { params: Promise.resolve({ token: badToken }) });

    expect(response.status).toBe(404);
  });
});
