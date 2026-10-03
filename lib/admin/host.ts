// Pure host/path routing for proxy.ts, kept separate so it's unit-testable.
// Two internal sites share the same mechanism, picked by the first label
// of the Host header (prod: admin./app.quotationtocash.com; dev:
// admin./app.localhost — *.localhost resolves with no setup):
//   admin.* -> /admin/*      (business management)
//   app.*   -> /analytics/*  (platform analytics)
function hostname(hostHeader: string | null | undefined): string {
  return (hostHeader ?? "").split(":")[0].toLowerCase();
}

export function isAdminHost(hostHeader: string | null | undefined): boolean {
  return hostname(hostHeader).startsWith("admin.");
}

export function isAnalyticsHost(hostHeader: string | null | undefined): boolean {
  return hostname(hostHeader).startsWith("app.");
}

// Either internal site: no Clerk middleware, no Clerk provider.
export function isInternalHost(hostHeader: string | null | undefined): boolean {
  return isAdminHost(hostHeader) || isAnalyticsHost(hostHeader);
}

export type AdminRouting =
  | { kind: "pass" }
  | { kind: "rewrite"; pathname: string }
  | { kind: "notFound" };

const isUnder = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

// On an internal host every page path maps onto that site's route prefix
// (/login -> /admin/login). /api/admin/* never reaches proxy.ts (matcher
// exclusion) and is served as-is; any other /api/* is refused so no
// Clerk-authenticated route is reachable without Clerk middleware. A
// site's own prefix is not directly addressable, and both prefixes are
// 404 on every non-matching host.
export function resolveAdminRouting(
  hostHeader: string | null | undefined,
  pathname: string,
): AdminRouting {
  const site = isAdminHost(hostHeader) ? "/admin" : isAnalyticsHost(hostHeader) ? "/analytics" : null;
  const touchesInternalPrefix = isUnder(pathname, "/admin") || isUnder(pathname, "/analytics");

  if (!site) return touchesInternalPrefix ? { kind: "notFound" } : { kind: "pass" };
  if (isUnder(pathname, "/api") || touchesInternalPrefix) return { kind: "notFound" };
  return { kind: "rewrite", pathname: pathname === "/" ? site : `${site}${pathname}` };
}
