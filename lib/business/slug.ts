// See docs/public-share-subdomains-design.md §1. slug is auto-generated
// at business-creation time from the business name, never a UI step, and
// (for now) never edited afterward — see the design doc for why
// immutability is the deliberately simple starting point.

// Blocked at generation time only — never re-checked anywhere else. A
// reserved word can never be assigned to a real business, so at read
// time (the subdomain mismatch check) it's indistinguishable from any
// other subdomain that doesn't match a real business's slug — same
// code path, no special-casing. See design doc §2's note on this.
export const RESERVED_SLUGS = new Set([
  // Real top-level routes in this app. A slug identical to one of these
  // can never actually collide at the routing level (subdomains and
  // paths are independent axes), but it reads as broken or suspicious
  // to a customer, not as a legitimate business.
  "dashboard", "customers", "invoices", "products", "quotations",
  "settings", "sign-in", "sign-up", "onboarding", "invite",
  "invitations", "public", "api",

  // Conventional subdomain reservations — either plausible future
  // infrastructure or universally-recognized non-business subdomains
  // that would look like a phishing attempt if a real business's link
  // used them.
  "www", "mail", "ftp", "admin", "app", "static", "assets", "cdn",
  "docs", "blog", "status", "support", "help", "staging", "dev",
  "test", "ns1", "ns2", "smtp", "webmail", "autodiscover",
]);

const MAX_SLUG_LENGTH = 63; // DNS label length limit, not an aesthetic cap.

// Lowercase, strip accents, collapse non-alphanumeric runs to a single
// hyphen, trim. Falls back to "business" for a name that slugifies to
// nothing (all punctuation/emoji, or script with nothing left after the
// accent-strip) so the collision-suffix logic below always has a valid
// base to work from, never a blank one.
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");

  return base || "business";
}

// `isTaken` is injected rather than this function querying Prisma
// directly, so the collision/suffix logic is testable as pure logic
// (see lib/business/__tests__/slug.test.ts) — the real caller closes
// over a DB check (or, for the one-off backfill script, an in-memory
// set of slugs already assigned in the same run).
export async function generateUniqueSlug(
  name: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name);

  let candidate = base;
  let suffix = 1;
  while (RESERVED_SLUGS.has(candidate) || (await isTaken(candidate))) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}
