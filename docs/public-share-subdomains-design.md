# Subdomain-Based Public Share URLs — Design Proposal

Status: **proposal, not implemented**. Scope is exactly what was asked:
`app/public/documents/[token]/page.tsx` and
`app/public/documents/[token]/pdf/route.ts`. Nothing about the
authenticated internal app or invitation links changes.

## 0. What I verified before designing anything

Two things worth confirming empirically rather than assuming, since both
are load-bearing for the rest of this doc:

- **`*.localhost` subdomains resolve with zero setup.** I navigated this
  session's real running dev server to
  `http://test-subdomain-check.localhost:3000/` — no `/etc/hosts` entry,
  no DNS, nothing configured — and it served the actual app (confirmed
  via page title and rendered content, not just a connection). This is
  the real test path for everything in §6; it isn't a "should work"
  claim.
- **Next.js's own routing doesn't care about the `Host` header at all**
  by default — it routes purely by path. A request to
  `aram-info-tech.quotationtocash.com/public/documents/abc123` already
  reaches the exact same route as the flat URL does today, with zero
  middleware involvement. This matters a lot for the design below: the
  middleware's job is narrower than "make this URL reachable" — it
  already is. Its actual job is telling the route handler *which*
  subdomain the request arrived on, so the handler can decide whether
  that matches the document's own business.

That second point reframes the whole problem in a smaller, safer
direction than "middleware resolves a business from a subdomain" might
suggest, so I want to flag the reframe explicitly before the rest of the
doc leans on it (§2).

## 1. The `slug` field

```prisma
model Business {
  id   String @id @default(uuid())
  name String
  slug String @unique
  ...
}
```

No `@map()` needed — single lowercase word, same as `name`/`email`/`gstin`
already on this model.

### Generation

Auto-generated at business-creation time (`POST /api/business`, inside
the existing transaction that also creates the owner `BusinessMember`),
never a UI step:

```
slugify("Aram Info Tech")  -> "aram-info-tech"
```

- Lowercase, strip accents, collapse any run of non-`[a-z0-9]` characters
  to a single hyphen, trim leading/trailing hyphens.
- Cap at 63 characters — the actual DNS label length limit, not an
  arbitrary aesthetic choice — then re-trim a trailing hyphen the cut
  might leave behind.
- Degenerate case: a name that slugifies to an empty string (all
  punctuation/emoji, or entirely non-Latin script with nothing left
  after the accent-strip) falls back to the literal string `"business"`
  before collision handling runs — so it still gets a valid, unique slug
  via the suffix logic below, never a blank or malformed one.

### Collision handling

If the base slug is taken (or reserved — see below), append `-2`, `-3`,
… until free:

```
"Aram Info Tech" (first)  -> aram-info-tech
"Aram Info Tech" (second) -> aram-info-tech-2
```

Implementation shape: check-then-use inside the same transaction as the
business insert (query for the candidate, increment on conflict), not
the insert/catch-P2002/retry pattern used elsewhere in this app for
`User` creation and `Invitation` resending. Those two are genuine
multi-request races (two tabs, two admins). A business being created is
one person's one deliberate action — there's no realistic concurrent
collision to protect against here, so the simpler check-then-use is
proportionate. The `@unique` constraint is still the real backstop
either way: if some genuinely freak race did slip past the check, the
insert fails cleanly on the DB constraint rather than silently
duplicating, so correctness doesn't depend on which app-level approach
is used — only smoothness in an effectively-never case does.

### Reserved slugs

Blocked at generation time — never checked again anywhere else (see the
note at the end of §3 for why). Proposed list, as a named constant, in
two groups:

```ts
const RESERVED_SLUGS = new Set([
  // Real top-level routes in this app. A slug identical to one of these
  // can never actually collide at the routing level (subdomains and
  // paths are independent axes — see §0), but it reads as broken or
  // suspicious to a customer, not as a legitimate business.
  "dashboard", "customers", "invoices", "products", "quotations",
  "settings", "sign-in", "sign-up", "onboarding", "invite",
  "invitations", "public", "api",

  // Conventional subdomain reservations — either plausible future
  // infrastructure (api, admin, app, status, docs, blog, help, support,
  // cdn, static, assets) or universally-recognized non-business
  // subdomains that would look like a phishing attempt if a real
  // business's link used them (www, mail, ftp, ns1, ns2, smtp, webmail,
  // autodiscover, staging, dev, test).
  "www", "mail", "ftp", "admin", "app", "static", "assets", "cdn",
  "docs", "blog", "status", "support", "help", "staging", "dev",
  "test", "ns1", "ns2", "smtp", "webmail", "autodiscover",
]);
```

This is a proposal, not a settled list — trim or extend it in review.

### Backfill for existing rows

This is a distinct concern from the "no backward-compatibility burden"
point in your prompt, worth separating clearly: that point is about
*real customer share links* (there are none yet, so no flat-URL fallback
logic is needed — confirmed in §7). This is about *existing `Business`
rows in whichever database the migration runs against* — the current
dev/staging Supabase project already has several real test businesses
from this session's own work (Aram info tech, Ajar Associates, etc.).
Adding a `NOT NULL UNIQUE` column to a table with existing rows needs a
value for those rows before the constraint can land. Standard safe
sequence: add `slug` nullable, backfill every existing row via a small
one-off script that calls the *exact same* `generateUniqueSlug()`
function real business-creation will use (not a separately-written copy
of the logic — avoids the two ever drifting apart), then tighten the
column to `NOT NULL UNIQUE`. Low-risk given the current row count, and
irrelevant to production the moment it launches with zero rows to
backfill.

## 2. The middleware mechanism — revised after implementation testing

**Update, post-implementation**: the mechanism actually built is simpler
than what was originally proposed here, because live testing surfaced a
real problem with the original plan before it shipped. Recording both —
what was proposed and why it changed — rather than quietly rewriting
this section, since the reason is worth keeping.

**Original proposal**: middleware rewrites `/public/documents/*`
requests on a business subdomain, threading the extracted slug through
as a `_slug` search param, which the route handler reads. That's what
§0's reframe argued for, and the reasoning there (no DB lookup in
middleware, reserved words need no separate enforcement) still holds.

**What broke it**: testing this locally (exactly the `*.localhost`
technique §6 describes) found that `req.nextUrl.hostname` inside
middleware does *not* reliably reflect the actual incoming `Host` header
in this environment, and — more importantly — a middleware-rewritten
search param does not reliably survive into `request.nextUrl.searchParams`
in the destination Route Handler either, even though the rewrite's own
`x-middleware-rewrite` debug header showed the correct value. This
produced an actual infinite redirect loop on the *correct* subdomain: the
handler never saw `_slug`, treated every request as a mismatch, and
redirected to the same URL it was already on. Confirmed with direct
`console.log`s of `req.nextUrl.hostname` vs. the raw `req.headers.get("host")`
inside middleware, and of `request.nextUrl.searchParams` inside the PDF
route — the raw header was always correct; the parsed `NextURL` fields
were not, across the rewrite boundary.

**What's built instead**: no middleware involvement at all.
`lib/documents/public-access.ts` reads the incoming request's `Host`
header directly via `headers()` from `next/headers` — which works
identically in a Server Component (the page) and a Route Handler (the
PDF route), so both callers share one implementation with no
per-context branching — and extracts the slug from it with the same
`extractBusinessSlug()` pure function §1's reserved-word reasoning
already assumed. `proxy.ts` is back to exactly what it was before this
feature.

This is a strictly better place to land than the original proposal, not
a compromise:

- **No middleware changes, at all** — `clerkMiddleware()` untouched, no
  rewrite, no matcher considerations, no Edge-runtime questions to
  reason about. Smaller diff than "minimal to no changes" to the route
  handlers even implied.
- **No fragile hand-off.** The original design's weak point was passing
  state from middleware to a handler through a URL rewrite and hoping it
  survives. Reading the header directly, once, in the same function that
  needs it removes that hand-off entirely rather than debugging it into
  reliability.
- **Reserved words still need no separate enforcement** — that reasoning
  never depended on where the header gets read, only on reserved slugs
  being unassignable to a real business (§1), which is unchanged.
- **The path-shape decision is unaffected** — still recommending
  `/public/documents/[token]` unchanged, for the same reason (§0: all the
  branding value is in the subdomain, not the path).
- **The `lib/app-url.ts` consolidation still stands**, just with one
  fewer consumer than originally described: `appHostname()` is used by
  `lib/documents/public-access.ts` and the two `public-url.ts` helpers —
  three call sites, not a middleware plus two helpers, but the same
  three-strikes justification for not hardcoding it independently in
  each place.

## 3. The mismatch case

Your instinct is right, and I'd extend it slightly further: **treat
"wrong subdomain" and "no subdomain at all" as the same case**, both
resolved by redirecting to the canonical URL for that document's real
business, never a 404 or an error.

- **Wrong subdomain** (`some-other-biz.quotationtocash.com/public/documents/{token}`
  where the token belongs to a different business): the `Host` header's
  extracted slug doesn't match `document.business.slug` → redirect.
- **No subdomain** (the flat `quotationtocash.com/public/documents/{token}`,
  or `www.quotationtocash.com/...`): `extractBusinessSlug()` returns
  `null` for the apex/www host → same redirect logic, same code path.
  This isn't a separate case to handle — it's the same rule with the
  extracted value being `null` rather than wrong, which is why unifying
  them is simpler than it might first look, not a simplification that
  hides something.

Redirect target: `https://{document.business.slug}.{apex}/public/documents/{token}`
(and the equivalent `/pdf` path). **307**, not 301 — the token, not the
subdomain, is the durable identity here; a 301 risks a browser or CDN
caching a redirect permanently for a URL shape that isn't actually
guaranteed permanent (if slug-editing is ever added later, a stale
cached 301 would be actively wrong). 307 preserves method and doesn't
get treated as cacheable-forever.

**Why this is genuinely just UX, not a security question, confirmed**:
reaching the mismatch branch at all requires already possessing a valid
token — the token is looked up first, completely unchanged, and a
nonexistent token still 404s exactly as it does today, regardless of
subdomain. Once you have a valid token, you already have full access to
that document's content under the *correct* URL; the redirect doesn't
grant anything a valid token didn't already grant, it just corrects the
address bar. There's no enumeration angle either — the redirect target
only ever reveals the real business's slug to someone who already holds
a working token for that exact document, which is a strictly narrower
disclosure than "here's the document's full content," which they get
either way.

## 4. What actually changes in the two route handlers

Small, and identical in shape for both, which is worth extracting once
rather than writing twice — a small shared helper (e.g.
`lib/documents/public-access.ts`) that both `page.tsx` and `pdf/route.ts`
call:

1. Read the subdomain via `headers()` from `next/headers` (works
   identically in the page and the route handler, so one implementation
   serves both — see §2's revision for why this replaced the originally-
   proposed middleware hand-off) and extract the slug with
   `extractBusinessSlug()`.
2. The existing `prisma.document.findUnique({ where: { shareToken } })`
   call is **unchanged** — still the sole lookup, still the sole access
   control — except its `include` gains `business: { select: { slug: true } }`,
   one field on a query that already runs.
3. Not-found → 404, exactly as today, regardless of the extracted slug.
4. Found, and the extracted slug `!== document.business.slug` (including
   `null` for no subdomain) → redirect (§3). Found, and it matches →
   proceed exactly as today.

That's the complete change to both routes' logic — the token lookup, the
"mark viewed" write, the PDF rendering, all untouched.

## 5. The URL builder

`lib/documents/public-url.ts`'s `publicDocumentUrl()` needs to take the
business's slug, not just the token, and build the subdomain form:

```
{slug}.{apex}/public/documents/{shareToken}
```

This is the one real ripple: every call site needs the business's slug
threaded through, not just the token. Checking where those are —
`share`/`send` routes and the email templates (`buildDocumentEmailHtml`'s
`viewUrl`) all already have the `business` row in scope from their
existing queries, so this is "pass one more field already on hand," not
a new query anywhere.

## 6. Local verification

Confirmed in §0: `*.localhost` subdomains just work, no `/etc/hosts`
edits, no production DNS/SSL needed to test any of this. The concrete
test path once implemented: run the dev server, hit
`aram-info-tech.localhost:3000/public/documents/{realToken}` directly in
a browser, confirm it renders; hit the same token under
`wrong-slug.localhost:3000/public/documents/{token}` and confirm the
307 to the correct subdomain; hit the flat
`localhost:3000/public/documents/{token}` and confirm the same
redirect. All three are real, no infrastructure stand-in needed.

## 7. Confirming: no backward-compatibility burden

Confirmed as stated: production is a fresh Supabase project with zero
real customers and zero share links ever sent. That means `publicDocumentUrl()`
can switch straight to the subdomain form with no dual-format support,
no "still understand the old flat shape forever" logic, and no
migration window — the redirect in §3 is a permanent piece of URL
hygiene (handles a stray bookmark, a manually-typed flat URL, a future
slug change), not a temporary compatibility shim for links that don't
exist. Building flat-URL-forever fallback logic now would be solving a
problem this launch doesn't have.

## 8. Explicitly out of scope — confirmed untouched

- Authenticated internal app: `requireBusiness()`/`ACTIVE_BUSINESS_COOKIE`
  unchanged; `proxy.ts` has no new logic at all (§2's revision), and the
  subdomain-reading code only ever runs inside
  `lib/documents/public-access.ts`, called only from the two public
  document routes — there's no path by which this touches
  dashboard/settings/customers/etc.
- `/invite/[token]`: not modified; invitations keep their existing flat
  URL shape (`lib/invitations/public-url.ts` untouched beyond the shared
  `lib/app-url.ts` extraction in §2, which is a pure refactor of what it
  already does, not a behavior change).
- DNS/wildcard TLS: nothing in this design touches infrastructure —
  everything above is application code that's inert in production until
  wildcard DNS/certs exist there, and fully testable today without them
  (§6).
