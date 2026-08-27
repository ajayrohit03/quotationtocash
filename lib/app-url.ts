// Single source of truth for the app's own base URL and hostname —
// previously duplicated independently in lib/documents/public-url.ts and
// lib/invitations/public-url.ts; consolidated here once proxy.ts became
// a third consumer needing the same "parse NEXT_PUBLIC_APP_URL, with a
// safe fallback" logic (see docs/public-share-subdomains-design.md §2).
//
// `||`, not `??`, deliberately — an empty-but-set env value should still
// fall back to localhost, not produce a relative/invalid URL.
export function appBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return base.replace(/\/$/, "");
}

export function appHostname(): string {
  return new URL(appBaseUrl()).hostname;
}
