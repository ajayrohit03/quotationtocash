# Feature Flags & Plan Model — Design Proposal

Status: **draft, for review. No code written.** Phase 2 of the admin
work: a `plan` on `Business`, a code-defined feature catalog, a pure
`featureEnabled()` helper, and one admin-only API route to set a plan.
Written against the live code — every "currently" below was confirmed by
reading `prisma/schema.prisma` (Business model and enums),
`lib/auth/permissions.ts`, `proxy.ts`, `lib/env.ts`, `lib/rate-limit.ts`,
`lib/api/respond.ts`, `app/api/business/*`, `lib/validation/document.ts`,
and `components/` for what is gate-able. Next.js docs in
`node_modules/next/dist/docs/` (proxy.md) were read for matcher behavior.

---

## 0. What exists today (and what that changes)

- **No plan concept anywhere.** `grep -i plan prisma/schema.prisma` finds
  nothing; `Business` has no billing/tier field. No field-name conflicts
  for the five proposed columns.
- **The middleware file is `proxy.ts`**, not `middleware.ts` (Next 16
  rename; build output shows "Proxy (Middleware)"). It is
  `export default clerkMiddleware()` with **no protection logic** — it
  only establishes Clerk auth context; every page/route authenticates
  itself via `requireAuth()`/`requireBusiness()`. Its matcher is:
  ```
  "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|…|ico|…)).*)"
  "/(api|trpc)(.*)"
  ```
  The **first** entry matches almost every path, including `/api/*`.
  This matters in §5.
- **Permissions (`lib/auth/permissions.ts`) are role-based** (owner /
  admin / staff, plus a derived Manager) — *who* may do something.
  Plans are an orthogonal axis: *whether the business's tier includes
  the capability at all*. They must not be merged into `PERMISSIONS`
  (that catalog is per-user and role-derived; a plan is per-business).
  Future enforcement is the AND of both: `can(user, "jobs.create") &&
  featureEnabled(business, "jobs_pnl")`.
- **Naming collision to resolve:** the landing page's pricing section
  has **three** tiers (Starter ₹0 / Growth ₹999 / Enterprise), but the
  requested enum has **four** (`free | starter | growth | enterprise`)
  with `starter` as a *paid-or-not-free* tier. See Open Question 1.
- **Existing per-business toggles stay.** `Business.gstEnabled` and
  `Business.einvoicingEnabled` are the business's *own opt-ins*. A plan
  flag answers "is the business *allowed* to turn this on", not "is it
  on". Both layers coexist (e.g. e-invoicing UI shown only when
  `featureEnabled(b, "einvoicing") && b.einvoicingEnabled`).
- **Team size is currently unlimited and ungated**; there is no member
  cap in `app/api/business/members` or the invitation routes.
- **All templates, custom fields, multi-currency, AP and Job P&L are
  currently available to everyone.** Nothing here is enforced in this
  phase (§5 of the request) — the catalog only *describes* the intended
  tiers.

---

## 1. Schema changes (single migration)

```prisma
enum Plan {
  free
  starter
  growth
  enterprise

  @@map("plan")
}

model Business {
  // …existing fields unchanged…

  // Billing tier — see docs/feature-flags-and-plans-design.md. Read ONLY
  // through lib/plans/featureEnabled(); never compare `plan` directly in
  // feature code. Set by the admin API route only (no in-app UI).
  plan                Plan      @default(free)
  // Per-business exceptions to the plan's feature set. Shape:
  // Record<FeatureKey, boolean>. true grants a feature the plan lacks,
  // false revokes one it has. Absent key = follow the plan.
  planOverrides       Json?     @map("plan_overrides")
  planNote            String?   @map("plan_note")
  planUpdatedAt       DateTime? @map("plan_updated_at")
  // Clerk user ID, or null when set via the shared-password admin path
  // with no identified actor — see §4.4.
  planUpdatedByUserId String?   @map("plan_updated_by_user_id")
}
```

| Field | Type | Notes |
|---|---|---|
| `plan` | `Plan` enum, NOT NULL, default `free` | Postgres enum `plan` |
| `planOverrides` | `Json?` (`jsonb`) | null = no overrides |
| `planNote` | `String?` (`text`) | internal only; never returned by any non-admin route |
| `planUpdatedAt` | `DateTime?` | null until first admin change |
| `planUpdatedByUserId` | `String?` | no FK — Clerk IDs aren't in our DB as a table the admin path can rely on |

**Not added:** no `PlanChange` audit table. Recommended as a follow-up
(Open Question 4) since `planNote`/`planUpdatedAt` only keep the *last*
change.

## 2. Feature catalog

`lib/plans/catalog.ts` — a plain TS const, **zero imports** (so the admin
subdomain can import or copy it; see §3).

```ts
export const PLANS = ["free", "starter", "growth", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];
```
`PLANS` is the single source for the TS type; a unit test asserts it
equals the Prisma `Plan` enum values, so they cannot drift.

### 2.1 Boolean features (override-able)

Names are derived from capabilities that actually exist in the codebase
today. Rows marked ★ are the ones you listed; the rest are additions.

| Feature key | free | starter | growth | enterprise | Backed by (what it would gate) |
|---|:-:|:-:|:-:|:-:|---|
| `quotations` ★ | ✓ | ✓ | ✓ | ✓ | quotations routes/builder |
| `invoices.unlimited` ★ | ✗ | ✓ | ✓ | ✓ | removes the free monthly cap — **TODO, not implemented** (§2.3) |
| `proforma` ★ | ✗ | ✓ | ✓ | ✓ | `/proforma-invoices/*`, `DocumentType.proforma` |
| `custom_fields.document` ★ | ✗ | ✓ | ✓ | ✓ | `CustomFieldScope.document` |
| `custom_fields.line_item` ★ | ✗ | ✗ | ✓ | ✓ | `CustomFieldScope.lineItem` |
| `multi_currency` ★ | ✗ | ✗ | ✓ | ✓ | non-INR `currency`, FC line columns, INR equivalent, LUT text |
| `purchase_invoices` ★ | ✗ | ✗ | ✓ | ✓ | purchase invoices incl. approval + vendor payments |
| `vendors` ★ | ✗ | ✗ | ✓ | ✓ | vendor CRUD |
| `jobs_pnl` ★ | ✗ | ✗ | ✓ | ✓ | Job entity, linking, P&L view |
| `layouts.all_five` ★ | ✗ | ✗ | ✓ | ✓ | `DocumentTemplate` beyond the base layout (below) |
| `team.extended` ★ | ✗ | ✗ | ✗ | ✓ | lifts the team cap — see §2.2 |
| `einvoicing` ★ | ✗ | ✗ | ✗ | ✓ | IRP scaffolding, "Generate IRN" |
| `team.hierarchy` | ✗ | ✗ | ✓ | ✓ | `reportsToId` manager scope (hierarchy-access-control-design) |
| `documents.branding` | ✗ | ✓ | ✓ | ✓ | logo/signature sizes, accent color, font size customisation |
| `export.lut` | ✗ | ✗ | ✓ | ✓ | LUT declaration; kept separate from `multi_currency` only if you want to sell them apart — otherwise fold into it (Open Question 3) |

**Deliberately NOT gated (all plans, so not in the catalog):** GST
(`gstEnabled`, CGST/SGST/IGST), payment tracking on sales documents,
bank details, public share links, document email sending, customers,
products, PDF download, signature block. Gating any of these is a
product call, not a technical one; the catalog is easy to extend later
(add a key + one row), and an *unknown* key is `false` for every plan, so
adding a key can never accidentally grant access.

**`layouts.all_five`:** the base layout for lower tiers must be named.
Proposal: `free`/`starter` get `classic` only; flag if you'd rather give
`classic + modern`.

### 2.2 Numeric limits are separate from boolean flags

Two of your items are quantities, not switches (`team.extended`:
"growth = max 5", free = "capped at 10/month"). `planOverrides` is
`Record<string, boolean>` by your spec, so it cannot express "set this
business's cap to 12". Proposal — keep the shape you specified, and add
a **second, non-overridable** table next to the catalog:

```ts
export const PLAN_LIMITS = {
  free:       { "team.max_members": 1,    "invoices.per_month": 10 },
  starter:    { "team.max_members": 2,    "invoices.per_month": null },
  growth:     { "team.max_members": 5,    "invoices.per_month": null },
  enterprise: { "team.max_members": null, "invoices.per_month": null },
} as const; // null = unlimited
```
The boolean overrides still act as the switch: `team.extended`
(override to `true` → unlimited members), `invoices.unlimited` (override
→ lifts the monthly cap). So an admin can grant "no cap" to one
business but not an arbitrary custom number — which is the realistic
need and keeps `Record<string, boolean>` honest. The numeric values above
for `free`/`starter` members are **placeholders I made up** (your doc
specified only growth = 5); confirm them. **`PLAN_LIMITS` is defined but
read by nothing in this phase.**

### 2.3 Invoice-count cap — TODO only

`invoices.unlimited` appears in the catalog with the explanatory
comment and a `// TODO(enforcement): free plan = 10 invoices/month,
see PLAN_LIMITS` marker. No counting query, no UI, no API rejection is
written. When built, "month" must be defined (calendar month in IST,
matching the existing `lib/dates.ts` conventions) and the count must
cover finalized invoices only vs. drafts — to be decided then.

## 3. `featureEnabled()`

`lib/plans/feature-enabled.ts` — pure, no `server-only`, no Prisma, no
React; imports only `./catalog`.

```ts
export type FeatureKey = keyof typeof PLAN_FEATURES.free; // union of catalog keys

export function isFeatureKey(value: string): value is FeatureKey;

export function featureEnabled(
  business: { plan: Plan; planOverrides: unknown },
  feature: FeatureKey,
): boolean;
```
Logic:
1. Parse `planOverrides` defensively: if it is not a plain object
   (null, array, string, number) → treated as `{}`.
2. If `Object.hasOwn(overrides, feature)` **and**
   `typeof overrides[feature] === "boolean"` → return it. (`hasOwn`
   avoids prototype keys like `constructor`; non-boolean values such as
   `"true"` or `1` are ignored, not coerced — a hand-edited bad value
   must never silently grant a paid feature.)
3. Else return `PLAN_FEATURES[plan][feature] ?? false`.

Deviations from your signature, both deliberate:
- `feature` is typed `FeatureKey` instead of bare `string`, so a typo in
  future enforcement code is a compile error. The admin route receives
  strings from the network, so it uses `isFeatureKey()` to narrow.
  Unknown strings at runtime still return `false`.
- `planOverrides: unknown` rather than Prisma's `JsonValue`, so the file
  needs no `@prisma/client` import (this is what makes it usable from the
  admin subdomain).

**Importability.** If the admin UI is a separate deployable (a
different Next app on `admin.…`), it cannot `import "@/lib/…"` across
repos; because `lib/plans/` has zero imports it can be copied or put in a
workspace package unchanged. If it is the same repo/app (a host-routed
route group), it just imports it. This depends on Open Question 2.

Tests (`lib/plans/__tests__/`): every plan × every key matches the
table; override true grants, override false revokes; null/array/garbage
`planOverrides`; `"true"`/`1` ignored; unknown key → false;
`__proto__`/`constructor` keys; `PLANS` equals the Prisma enum.

## 4. Admin API route

### 4.1 Contract

`POST /api/admin/businesses/[id]/plan`, `[id]` = `Business.id` (UUID).

Request (JSON, zod `.strict()`):
```ts
{
  plan: "free" | "starter" | "growth" | "enterprise",
  note?: string | null,             // max 1000 chars; omitted = leave unchanged
  planOverrides?: Record<FeatureKey, boolean> | null, // see below
  updatedBy?: string                 // optional actor label/Clerk id
}
```
Responses: `200 { id, plan, planOverrides, planNote, planUpdatedAt,
planUpdatedByUserId }`; `400` validation (unknown override keys are
rejected, not stored); `401` bad/missing credential; `404` no such
business; `429` rate limited.

**Scope question you should confirm:** your spec says the route "sets
plan + note". `planOverrides` then has **no writer at all**. I propose
the same route also accepts `planOverrides` (full replace; `null`
clears) rather than adding a second route. If you want overrides edited
separately, say so.

### 4.2 Auth mechanism

A server-only helper `lib/admin/auth.ts`:
`requireAdmin(request: Request): void` (throws `AdminAuthError` → 401),
called as the **first line of the route handler**, before parsing the
body or touching Prisma. Reasons for in-handler rather than in
`proxy.ts`: Next's own proxy docs warn that matcher changes can silently
remove coverage and tell you to verify auth inside each handler.

- Reads `ADMIN_PASSWORD` lazily through `lib/env.ts` (add to
  `serverSchema`, `z.string().min(16)`), same lazy-per-variable pattern
  as every other secret. **Fails closed:** if unset or too short, every
  admin request gets 401 (and a server log line) — never "open".
- Expects `Authorization: Bearer <password>`. Compares with
  `crypto.timingSafeEqual` over SHA-256 digests of both sides (equal
  length, no early exit).
- Identical 401 body for missing header, wrong scheme, wrong password,
  and unconfigured server (`{ error: "Unauthorized" }`), so the response
  doesn't reveal configuration state.
- **Rate limit before comparison**, reusing the existing Postgres
  `checkRateLimit()` keyed on `admin:${ip}` (`lib/request-ip.ts` exists),
  e.g. 20 attempts / minute / IP → 429. A shared password is
  brute-forceable without this.
- The password is **never logged**, never echoed in errors, and the
  route never sets cookies. The admin site must call this
  **server-to-server** (its own backend adds the header), not from
  browser JS — so no CORS headers are added, and `OPTIONS` is not
  handled. A browser-side caller would put the password in the page.

### 4.3 Write behavior

```ts
prisma.business.update({
  where: { id },
  data: {
    plan, planUpdatedAt: new Date(),
    planUpdatedByUserId: body.updatedBy ?? null,
    ...(note !== undefined && { planNote: note }),
    ...(planOverrides !== undefined && { planOverrides: planOverrides ?? Prisma.DbNull }),
  },
});
```
No transaction needed (single row). `P2025` → 404. A test covers: 401
paths, 400 unknown key, 404, success persisting all five columns,
`note` omitted preserves existing note, `planOverrides: null` clears.

### 4.4 Identity limitation of a shared password

`planUpdatedByUserId` is "which Clerk user". The admin path has **no
Clerk identity** — the only credential is one shared secret. So the
field can only be as trustworthy as whatever the admin site sends in
`updatedBy`; it is not proof of who acted. I'd store it as-given (or
null) and not present it as an audit guarantee. If real attribution
matters, that's an argument for the audit table or Clerk-authenticated
admin users in Phase 3 (Open Question 4).

## 5. Interaction with the Clerk middleware

Today `proxy.ts` runs `clerkMiddleware()` on nearly everything, and it
is passive (never redirects/blocks), so in principle admin requests
would pass through harmlessly. You asked for admin routes to be excluded
entirely, which is the better design (no Clerk context/handshake
attempt on a non-Clerk request, no Clerk headers in responses, no
dependency on Clerk being healthy for admin calls). Doing it correctly
needs care:

**Both matcher entries must change.** The first entry
(`/((?!_next|…ext…).*)`) already matches `/api/admin/…`, so editing only
the `(api|trpc)` entry would **not** exclude anything. Proposed:

```ts
matcher: [
  "/((?!_next|api/admin(?:/|$)|[^?]*\\.(?:html?|…existing list…)).*)",
  "/(api(?!/admin(?:/|$))|trpc)(.*)",
],
```
`(?:/|$)` anchors to the path segment, so `/api/administrator` (should
anyone ever create it) is *not* accidentally excluded, and `/api/jobs`
etc. are untouched. Matchers must stay compile-time constants per the
docs.

**Verification (planned, not assumed):** after the change, against a
built `next start`: `curl -i /api/admin/businesses/x/plan` must show
**no** `x-clerk-auth-status` header, while `curl -i /api/jobs` still
shows it (we saw those headers on `/robots.txt` earlier, so the signal is
reliable); `/dashboard`, `/api/jobs`, `/sign-in` behave as before. Plus
a small test that feeds representative paths through both matcher
regexes. No `(app)` route, page, or Clerk setting changes.

Layering of defenses: proxy exclusion (no Clerk) → handler `requireAdmin`
(real check) → rate limit. The exclusion is an optimization, not the
security boundary.

**Host question:** this route will be reachable on whatever host serves
the app (the `www` host) — Next routes by path, not Host (confirmed in
the public-share design doc §0). I'm not proposing Host-restricting it;
the bearer + rate limit are the guard. Say if you want it additionally
rejected unless `Host` is the admin subdomain.

## 6. Migration strategy

**One migration**, `…_add_business_plan`: `CREATE TYPE "plan" AS ENUM
(…)`, five `ALTER TABLE "businesses" ADD COLUMN`. Purely additive.
`plan` is NOT NULL with default `'free'`, so Postgres backfills every
existing row to `free` in the same statement — no data migration step,
no downtime, no table rewrite concerns at this size.

**Existing businesses become `free` on deploy.** Harmless *now*
(nothing enforces anything), but a trap later: the day enforcement
ships, every current customer would be locked to free limits unless
re-planned first. Recommend the rollout rule: **no enforcement code
merges until every existing business has been assigned a plan through
the admin route** (or a one-off backfill — e.g. existing → `growth` —
runs in the same release as the first enforcement). Flagged as Open
Question 5; not done in this migration.

Rollback: drop the five columns and the enum; nothing depends on them.

## 7. Files this would touch (when approved)

`prisma/schema.prisma` + migration · `lib/plans/catalog.ts`,
`lib/plans/feature-enabled.ts`, tests · `lib/admin/auth.ts` ·
`app/api/admin/businesses/[id]/plan/route.ts` (+ tests) · `lib/env.ts`
(`ADMIN_PASSWORD`) · `.env.example` · `proxy.ts` matcher. Deploy note:
`ADMIN_PASSWORD` must be set in the server `.env` and the app restarted,
or every admin call returns 401 (fails closed by design).

## 8. Open questions

1. **Tier naming.** Landing page: Starter (₹0, 10 invoices) / Growth /
   Enterprise. Enum: free / starter / growth / enterprise. Is the
   landing's "Starter ₹0" really `free`, with a *new* paid `starter`
   between them? The landing copy also says Growth includes custom
   fields, while the catalog has document custom fields at `starter`+.
   Either the page or the catalog needs adjusting before launch.
2. **Is the admin site a separate deployable or a route group in this
   app?** Decides how `lib/plans/` is shared (§3).
3. **Fold `export.lut` into `multi_currency`?** And `layouts` base
   layout: `classic` only, or `classic + modern`?
4. **Audit trail:** add a `PlanChange` table (who/when/from/to/note), or
   accept last-change-only? And `updatedBy` semantics (§4.4).
5. **Backfill rule for existing businesses before any enforcement**
   (§6).
6. **Member-cap numbers** for `free`/`starter` (§2.2) are placeholders;
   only growth = 5 was specified.
7. **Should the route also accept `planOverrides`** (§4.1)? Proposed yes.
