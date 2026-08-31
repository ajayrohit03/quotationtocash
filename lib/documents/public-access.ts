import "server-only";

import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { publicDocumentUrl } from "@/lib/documents/public-url";
import { appHostname } from "@/lib/app-url";
import { extractBusinessSlug } from "@/lib/business/subdomain";

// Shared by app/public/documents/[token]/page.tsx and its /pdf
// counterpart — see docs/public-share-subdomains-design.md §4. The token
// lookup is completely unchanged from before this feature (still the
// sole access control, still shareToken-only); the only addition is
// pulling in the document's real business.slug to compare against
// whatever subdomain the request actually arrived on.
//
// The subdomain is read here, once, via `headers()` from next/headers —
// which works identically in a Server Component (the page) and a Route
// Handler (the PDF route) — rather than threaded through as a
// middleware-injected search param. That was the original design
// (see the design doc's §2), but empirical testing found
// `req.nextUrl.hostname`/`searchParams` don't reliably survive a
// middleware rewrite into the destination handler in this environment,
// while the raw `Host` header always does. Reading it directly here
// removes the fragile hand-off entirely — middleware doesn't need to do
// anything for this feature at all.
const PUBLIC_DOCUMENT_INCLUDE = {
  lineItems: { orderBy: { sortOrder: "asc" as const } },
  convertedToInvoice: { select: { id: true, number: true } },
  business: { select: { slug: true } },
  // Newest first — see docs/payment-tracking-design.md §6. recordedBy
  // is fetched here too (present.ts computes recordedByName from it)
  // even though the public-facing renderer never displays it, so the
  // one conversion point stays the same regardless of caller.
  payments: {
    orderBy: [{ paidAt: "desc" as const }, { createdAt: "desc" as const }],
    include: { recordedBy: true },
  },
};

export type PublicDocument = NonNullable<
  Awaited<ReturnType<typeof fetchDocument>>
>;

async function fetchDocument(token: string) {
  return prisma.document.findUnique({
    where: { shareToken: token },
    include: PUBLIC_DOCUMENT_INCLUDE,
  });
}

async function requestedBusinessSlug(): Promise<string | null> {
  const headerList = await headers();
  const host = (headerList.get("host") ?? "").split(":")[0];
  return extractBusinessSlug(host, appHostname());
}

export type PublicDocumentAccess =
  | { kind: "not-found" }
  | { kind: "redirect"; url: string }
  | { kind: "ok"; document: PublicDocument };

// `pathSuffix` is "" for the page, "/pdf" for the download route, so the
// redirect target is the exact equivalent path on the correct subdomain.
export async function resolvePublicDocumentAccess(
  token: string,
  pathSuffix: "" | "/pdf",
): Promise<PublicDocumentAccess> {
  const [document, requestedSlug] = await Promise.all([
    fetchDocument(token),
    requestedBusinessSlug(),
  ]);
  if (!document) {
    return { kind: "not-found" };
  }

  // Wrong subdomain and no subdomain at all are the same case — both
  // reduce to "requestedSlug doesn't match this document's real
  // business," redirected identically. See design doc §3.
  if (requestedSlug !== document.business.slug) {
    return {
      kind: "redirect",
      url: `${publicDocumentUrl(token, document.business.slug)}${pathSuffix}`,
    };
  }

  return { kind: "ok", document };
}
