// Pure host/path routing for proxy.ts, kept separate so it's unit-testable.
// Any hostname starting "admin." is the admin site (admin.quotationtocash.com
// in prod, admin.localhost in dev — *.localhost resolves with no setup).
export function isAdminHost(hostHeader: string | null | undefined): boolean {
  const hostname = (hostHeader ?? "").split(":")[0].toLowerCase();
  return hostname.startsWith("admin.");
}

export type AdminRouting =
  | { kind: "pass" }
  | { kind: "rewrite"; pathname: string }
  | { kind: "notFound" };

// On the admin host every page path maps onto the app's /admin/* routes
// (/login -> /admin/login). /api/admin/* never reaches proxy.ts (matcher
// exclusion) and is served as-is; any other /api/* on the admin host is
// refused so no Clerk-authenticated route is reachable there without
// Clerk middleware. On every other host, /admin/* does not exist.
export function resolveAdminRouting(
  hostHeader: string | null | undefined,
  pathname: string,
): AdminRouting {
  const onAdminHost = isAdminHost(hostHeader);
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  if (!onAdminHost) {
    return isAdminPath ? { kind: "notFound" } : { kind: "pass" };
  }
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return { kind: "notFound" };
  }
  if (isAdminPath) {
    return { kind: "notFound" };
  }
  return { kind: "rewrite", pathname: pathname === "/" ? "/admin" : `/admin${pathname}` };
}
