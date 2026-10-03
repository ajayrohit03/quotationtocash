# Analytics Dashboard (app.quotationtocash.com) — Design Proposal

Status: **draft, for review. No code written.** Phase 4 of the admin work:
a read-only, owner-only dashboard on `app.quotationtocash.com` showing
platform-wide usage. Written against the live code — confirmed by reading
`proxy.ts`, `lib/admin/{host,auth,session,queries}.ts`,
`app/api/admin/auth/verify/route.ts`, `app/layout.tsx`,
`app/admin/**`, `prisma/schema.prisma` (Business, Document,
PurchaseInvoice, Job, CustomFieldDefinition), `lib/dates.ts`,
`lib/business/slug.ts` and `package.json`.

---

## 0. What exists today (and what that changes)

- **Admin host machinery is reusable almost as-is.** `lib/admin/host.ts`
  decides routing purely from the `Host` header; `proxy.ts` rewrites
  `admin.*` onto `/admin/*` and skips Clerk; the root layout skips
  `ClerkProvider` on that host; `requireAdmin`/`isAdminSession` guard
  routes and pages. Phase 4 adds a *second* host to the same mechanism.
- **The session cookie is host-only.** `admin_session` is set with no
  `Domain` attribute (`app/api/admin/auth/verify/route.ts`), so it is sent
  only to `admin.quotationtocash.com`. That is a deliberate property —
  see §2.
- **`/api/admin/*` bypasses `proxy.ts` entirely** (matcher exclusion), so
  those routes answer on *any* host, including a new `app.` host. Cookie
  auth works per host, so a login on `app.` would set an `app.`-scoped
  cookie by calling the same `/api/admin/auth/verify`.
- **`app` is already a reserved business slug**
  (`lib/business/slug.ts` RESERVED_SLUGS), so no customer can own
  `app.quotationtocash.com` as a public-share subdomain.
- **No charting library** in `package.json` (no recharts/d3/visx).
- **Real data is already in the shared DB that pollutes metrics.** The
  admin business list I used for verification shows leftover automated
  test businesses (e.g. "Multi Currency Test Co <uuid>", "Payments Test
  Co <uuid>", "Invite Test Co <uuid>") with `@example.invalid` emails.
  Left in, they inflate every number below. See §3.
- **Business has no "last login/active" field.** The admin list already
  defines "last active" as the latest edit to any document or purchase
  invoice; this design keeps that definition.
- **`Document.status` is a free `String`** (default `"draft"`), not an
  enum, and `Document.currency` is a `String` defaulting to `"INR"`.

---

## 1. Architecture

### 1.1 Host routing

Generalize `lib/admin/host.ts` from one host to a small table:

| Host prefix | Rewrites to | Hidden (404) on other hosts |
|---|---|---|
| `admin.` | `/admin/*` | `/admin/*` |
| `app.` | `/analytics/*` | `/analytics/*` |

`resolveAdminRouting` keeps its shape (`pass | rewrite | notFound`); the
rule "non-`/api/admin` API paths are 404 on these hosts, and the other
host's prefix is 404" is unchanged. `proxy.ts` needs no new logic beyond
what the function returns; `/analytics/*` is added to the not-found set
for non-`app.` hosts, and the root layout's Clerk-skip check becomes
"any internal host". Unit tests extend `host.test.ts` (look-alikes such as
`application.`/`apple.` must **not** match — match on the full `app.`
label prefix, exactly as `admin.` does).

### 1.2 Pages (server components, same pattern as the admin pages)

`app/analytics/` — `layout.tsx` (noindex, dark navy shell, same look as
admin), `login/page.tsx`, `(portal)/layout.tsx` (header + logout),
`(portal)/page.tsx` (the dashboard). Each page calls
`isAdminSession()` itself and redirects to `/login` — never relies on a
layout (layouts don't re-run on every client navigation).

`LoginForm` is shared: it gains a `redirectTo` prop (default
`/businesses`; analytics passes `/`). No duplicate login code.

### 1.3 Data access

One module, `lib/analytics/queries.ts` (`server-only`), exporting a single
`getAnalytics({ now?, businessIds? })` that runs all aggregates in one
`Promise.all`. `now` is injectable and `businessIds` optionally scopes to a
fixed set — both exist **for tests** (see §5), the page passes neither.
Month bucketing is a pure function in `lib/analytics/months.ts`. No raw SQL:
every metric is `count` / `groupBy` / `findMany` through Prisma, bucketing
done in JS. No new tables, **no migration**.

No API route is added: the page reads the query module directly (same as
the admin pages). A JSON endpoint can be added later if something needs it.

## 2. Authentication — the one real decision

You offered either a single session across both subdomains, or a separate
login on `app.` with the same password. **Recommendation: separate login,
host-only cookie.**

| | Shared cookie (`Domain=.quotationtocash.com`) | Separate login per host (recommended) |
|---|---|---|
| Login UX | once | once per host (same password) |
| Cookie sent to | **every** subdomain: `www.`, `admin.`, `app.`, and **every customer's `{slug}.quotationtocash.com` public-share host** | only the host that set it |
| Blast radius | any bug/XSS on a public-share page runs in a context that carries the admin cookie (still httpOnly, but it is *sent* to those requests) | unchanged from today |
| Code change | cookie `Domain` + all hosts must agree on name/flags | none to auth; just reuse |
| Invalidation | rotating `ADMIN_PASSWORD` kills both (same as separate) | same |

The shared cookie turns a deliberately host-scoped admin credential into
one transmitted to customer-facing hosts, to save one login. Not worth it.
The separate approach reuses `verify`, `logout`, `passwordMatches`, the
rate limiter, the HMAC token and the SameSite=Strict/httpOnly/Secure
flags **unchanged**; the only new code is the host mapping.

Side effect to be aware of: because `/api/admin/*` answers on every host,
a session on `app.` could also call the plan-edit route (with a same-origin
`Origin` header). It's the same person and password, so I propose leaving
it; if you'd rather the analytics host be strictly read-only, `requireAdmin`
can take an `allowedHosts` argument — say so.

## 3. What counts (definitions)

All metrics exclude **internal/test businesses**: those whose `email` ends
in `@example.invalid` (every automated test fixture uses it). This is a
convention, not a flag — no schema change. Real businesses of yours
(Ajar, Aram info tech …) are *not* excluded, since they're
indistinguishable from customers; see Open Question 2.

"Window" = rolling 30 days ending at `now`.

| Metric | Exact definition |
|---|---|
| Total businesses | count of non-internal `Business` |
| Active last 30 days | distinct non-internal businesses with any `Document` **or** `PurchaseInvoice` whose `updatedAt` ≥ now−30d (same signal as the admin "last active") |
| Total invoices created | count of `Document` where `type = invoice`, **all statuses including drafts and cancelled** ("created", not "issued") |
| Total documents | count of all `Document` rows (quotation + invoice + proforma) |
| Plan distribution | `Business` grouped by `plan`; all four plans always listed (0 when empty), with % of total |
| Signups per month | non-internal `Business.createdAt` over the last 6 **calendar months in IST** (current month + previous 5), zero-filled; current month labelled "so far" |
| Adopted AP | businesses with ≥ 1 `PurchaseInvoice` |
| Adopted Jobs | businesses with ≥ 1 `Job` |
| Adopted custom fields | businesses with ≥ 1 `CustomFieldDefinition` where `isActive = true` (soft-deleted ones don't count) |
| Adopted multi-currency | businesses with ≥ 1 `Document` of `type = invoice` and `currency <> 'INR'` (not just USD — "any foreign currency", which is what the feature is) |
| Top 5 by activity | non-internal businesses ranked by count of `Document`s **created** in the window (tie-break: name) — shown with that count, plan badge, link to the admin detail page |
| Recent signups | 5 newest non-internal businesses: name, plan, signup date |

Adoption is displayed as `n of N businesses (p%)` against Total businesses.
Each "distinct business" count is a `groupBy businessId` (length of the
result), not a per-business loop. Scale note: at current size every query
is trivially cheap; a caching layer is **not** proposed — revisit when the
business count is in the tens of thousands.

## 4. UI

Single page, dark navy theme matching `/admin`, desktop-first, stacking on
mobile:

1. **Overview cards** (4): total businesses · active 30d · invoices created
   · total documents.
2. **Plan distribution**: four horizontal bars using the admin plan
   colours (free grey, starter blue, growth green, enterprise purple), count
   + %.
3. **Signups per month**: bar chart, 6 columns.
4. **Feature adoption**: four rows, each with a bar, `n of N`, and `%`.
5. **Top 5 active (30d)** and **Recent signups** side by side.

**Chart implementation:** hand-written inline SVG bars, rendered on the
server. No dependency, no client JS, no hydration, fine for 6 bars and a
few horizontal bars. Adding recharts would be ~100 KB+ of client JS for
one chart. If you expect richer charts later, say so and I'll use a
library now.

Empty states: zero businesses/documents render zeros and an
"No signups yet" line rather than blank charts; division by zero shows "—".
All dates formatted via `lib/dates.ts` (IST). `noindex` meta as on admin.

## 5. Testing & verification

- **Pure unit tests:** `months.ts` — 6-month window incl. year rollover,
  IST boundary (a signup at 23:00 UTC on the 30th is next month in IST),
  zero-fill; percentage/zero-total helper; `host.test.ts` extensions for
  `app.` (incl. look-alikes) and cross-host 404s.
- **DB tests** use real rows with `getAnalytics({ now, businessIds })`
  scoped to the test's own businesses (the shared DB has other data, so
  global-count assertions would be flaky): known counts of documents /
  purchase invoices / jobs / custom fields / non-INR invoices, one
  `@example.invalid` business proving exclusion, a document just inside and
  just outside the 30-day window, cancelled/draft invoices counted, soft-
  deleted custom field not counted, top-5 ordering and tie-break.
- **Route/auth:** reuse the existing admin auth tests; add a page-level
  check that `/analytics` without a cookie redirects to `/login`.
- **Live (after deploy):** `curl -i` for the proxy behavior, a browser run
  of login → dashboard, console clean.
- Standard gate: typecheck, lint, full suite, production build.

## 6. Files this would touch

`lib/admin/host.ts` (+tests) · `proxy.ts` (comment only, if anything) ·
`app/layout.tsx` (Clerk-skip check) · `app/admin/login/login-form.tsx`
(`redirectTo` prop) · new: `lib/analytics/{queries,months}.ts` (+tests),
`app/analytics/{layout.tsx,login/page.tsx,(portal)/layout.tsx,
(portal)/page.tsx,(portal)/logout-button.tsx}`, small shared SVG bar
components. No schema/migration, no new env vars.

**Your side (not code):** add `app.quotationtocash.com` to the Vercel
project's domains and make sure DNS resolves it (a wildcard record may
already cover it, as it did for `admin.`) before the live check.

## 7. Open questions

1. **Auth:** separate host-only login (recommended, §2) vs the shared
   `Domain=` cookie. Also: should `app.` be strictly read-only?
2. **Internal/test exclusion:** is "`@example.invalid` emails excluded" the
   right rule? Your own businesses (Ajar Associates, Aram info tech) would
   still count. If you want them out, the clean fix is an `isInternal`
   boolean on `Business` (small migration, settable from the admin detail
   page) — more work now, accurate forever.
3. **Definitions:** (a) "active" = any document/purchase-invoice *edit* in
   30 days; (b) "invoices created" includes drafts and cancelled; (c)
   multi-currency = any non-INR invoice; (d) top-5 ranks by documents
   *created* in the window. Confirm or adjust.
4. **Chart:** inline SVG, no dependency (recommended) vs a charting
   library.
5. **Why a separate `app.` host at all?** Everything here could be a
   `/analytics` page on `admin.` with zero new routing or login. I've
   designed for `app.` as asked; if there's no other reason, that would be
   the less work.
6. **Naming:** `app.` is conventionally where a SaaS product itself lives.
   If you ever move the customer app there, this host and the reserved
   `app` slug will need revisiting. Fine to proceed; noting it now.
