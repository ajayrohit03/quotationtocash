import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";

// Real Business/Customer/Document rows — this is the actual decision
// point for the whole subdomain feature (docs/public-share-subdomains-design.md
// §3, §4): correct subdomain -> ok, wrong subdomain -> redirect, no
// subdomain -> the same redirect, bad token -> not-found regardless of
// subdomain. "server-only" and next/headers are mocked (the subdomain is
// read via headers().get("host") — see lib/documents/public-access.ts for
// why that's more reliable here than a middleware-injected search param).
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
      name: `Public Access Test Co ${randomUUID()}`,
      slug,
      email: `public-access-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Test Customer" },
  });

  const shareToken = randomUUID();
  const document = await prisma.document.create({
    data: {
      businessId: business.id,
      type: "quotation",
      number: `PUBLIC-ACCESS-${randomUUID().slice(0, 8)}`,
      customerId: customer.id,
      issueDate: new Date(),
      shareToken,
      customerSnapshot: {},
      businessSnapshot: {},
    },
  });

  return { business, document, shareToken };
}

describe("resolvePublicDocumentAccess", () => {
  it("returns 'ok' when the request's Host matches the document's real business subdomain", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    const { resolvePublicDocumentAccess } = await import(
      "@/lib/documents/public-access"
    );
    const slug = `matching-biz-${randomUUID().slice(0, 8)}`;
    const { shareToken } = await setupDocument(slug);
    mockHost(`${slug}.app.example.com`);

    const access = await resolvePublicDocumentAccess(shareToken, "");
    expect(access.kind).toBe("ok");
  });

  it("redirects when the Host is a different business's subdomain", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    const { resolvePublicDocumentAccess } = await import(
      "@/lib/documents/public-access"
    );
    const realSlug = `real-biz-${randomUUID().slice(0, 8)}`;
    const { shareToken } = await setupDocument(realSlug);
    mockHost("some-other-business.app.example.com");

    const access = await resolvePublicDocumentAccess(shareToken, "");
    expect(access.kind).toBe("redirect");
    if (access.kind === "redirect") {
      expect(access.url).toContain(`${realSlug}.`);
      expect(access.url).toContain(`/public/documents/${shareToken}`);
    }
  });

  it("redirects when there's no subdomain at all (flat access)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    const { resolvePublicDocumentAccess } = await import(
      "@/lib/documents/public-access"
    );
    const realSlug = `flat-access-biz-${randomUUID().slice(0, 8)}`;
    const { shareToken } = await setupDocument(realSlug);
    mockHost("app.example.com");

    const access = await resolvePublicDocumentAccess(shareToken, "");
    expect(access.kind).toBe("redirect");
    if (access.kind === "redirect") {
      expect(access.url).toContain(`${realSlug}.`);
    }
  });

  it("appends the given path suffix to the redirect target (for the PDF route)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    const { resolvePublicDocumentAccess } = await import(
      "@/lib/documents/public-access"
    );
    const realSlug = `pdf-redirect-biz-${randomUUID().slice(0, 8)}`;
    const { shareToken } = await setupDocument(realSlug);
    mockHost("app.example.com");

    const access = await resolvePublicDocumentAccess(shareToken, "/pdf");
    expect(access.kind).toBe("redirect");
    if (access.kind === "redirect") {
      expect(access.url.endsWith("/pdf")).toBe(true);
    }
  });

  it("returns 'not-found' for a token that doesn't exist, regardless of Host", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    const { resolvePublicDocumentAccess } = await import(
      "@/lib/documents/public-access"
    );
    mockHost("whatever-slug.app.example.com");

    const access = await resolvePublicDocumentAccess(randomUUID(), "");
    expect(access.kind).toBe("not-found");
  });
});
