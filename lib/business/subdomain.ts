// Pure string logic, no DB access — see
// docs/public-share-subdomains-design.md §2 for why: the actual slug ->
// real-business resolution happens in the route handler (which already
// has full Prisma access on every request), not here. This just decides
// whether a hostname *looks like* `{something}.{apex}` and, if so,
// extracts the single-label subdomain — nothing more.
export function extractBusinessSlug(
  hostname: string,
  apexHostname: string,
): string | null {
  if (hostname === apexHostname || hostname === `www.${apexHostname}`) {
    return null;
  }
  if (!hostname.endsWith(`.${apexHostname}`)) {
    // Unrecognized host entirely (a different domain, a raw IP, etc.) —
    // leave it alone rather than guessing.
    return null;
  }

  const candidate = hostname.slice(0, -(apexHostname.length + 1));
  // Only a single-label subdomain is ever a business slug — reject
  // anything deeper (foo.bar.{apex}) rather than treating "foo.bar" as
  // a slug that could never actually match a real business anyway.
  if (candidate.length === 0 || candidate.includes(".")) {
    return null;
  }

  return candidate;
}
