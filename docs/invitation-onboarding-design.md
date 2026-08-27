# Invitation-Based Onboarding — Design Proposal

Status: **proposal, not implemented**. Companion to
[`hierarchy-access-control-design.md`](./hierarchy-access-control-design.md),
which this doc extends in two places (a new `role` value, and where that
role sits relative to the visibility tree) without reopening anything that
doc already settled.

## 0. What's changing, and why the current mechanism doesn't count

The `role` field has meant exactly two things since the schema was drawn up:
`owner` (whoever created the business) and `staff` (everyone else). The spec
itself flagged this as provisional — "whether staff roles need finer-grained
permissions beyond owner/staff at MVP" was left as an open question.

The Team tab shipped this session added a *member*, not an *onboarding
path*: `POST /api/business/members` requires the invitee to already have a
`User` row, i.e. to have signed into InvoiceFlow at least once under any
business. That was good enough to unblock testing with two accounts that
happened to already exist, but it isn't a feature — a real employee who has
never used InvoiceFlow has no way to end up inside their employer's
business. If they sign up on their own, `/onboarding` (via
`requireBusinessForPage()`'s `NoBusinessError` → `/onboarding` redirect,
[`lib/auth/page.ts:36`](../lib/auth/page.ts)) puts them through the 4-step
wizard and makes *them* the owner of a brand-new, empty business. This
proposal replaces the add-by-email mechanism with real email invitations,
and introduces the Admin tier the invitation flow needs a sender for.

I'll treat two things as already decided, per your message, and design to
them rather than re-litigate: Admin is a real permission tier, and
acceptance requires a strict email match with distinct UX for "not signed
in" vs. "signed in as the wrong account."

---

## 1. The Admin permission tier

### 1.1 Where Admin lives in the schema

**Recommendation: extend the `role` enum — `owner | admin | staff`.**

Two shapes were on the table:

- **Extend the enum** (chosen). Every `BusinessMember` still has exactly
  one tier, the same as today. `requireBusinessOwner()` — already hardened,
  already tested, already relied on by the GST/business-profile routes —
  is untouched: it's still a single `role === "owner"` check. A new
  `requireBusinessAdmin()` sits beside it as `role === "owner" || role ===
  "admin"`.
- **A separate `isAdmin: Boolean` flag on top of `role: owner | staff`**
  (rejected). This looks more "flexible" but isn't — nothing in the
  requirements needs Admin-ness to vary independently of tier; the flag
  would only ever be meaningful when `role === "staff"`, which means it's
  an enum wearing a boolean's clothes. It also opens representable-but-
  meaningless states (`role: owner, isAdmin: true`) that the enum version
  can't express at all. Same reasoning the hierarchy doc used against
  hand-maintained incremental state: prefer the model that makes the
  invalid case unrepresentable.

A permissions-table approach (per-capability flags, not just a tier) was
never seriously in the running — nothing here calls for customizing
*which* owner-actions a given Admin gets. If that need ever shows up, it's
a schema change to make then; building it now would be exactly the kind of
speculative abstraction this project has avoided elsewhere.

**Implementation requirement, not just a naming convention:**
`requireBusinessAdmin()` must exist as exactly one shared helper — same
shape as `requireBusinessOwner()` today — that every admin-gated route
imports and calls. It must never be re-derived inline at each call site as
its own `role === "owner" || role === "admin"` expression. Owner's
permissions are a strict superset of Admin's (Tax/Billing plus everything
Admin gets), so *every* admin-tier check has to read Owner in, not just
Admin — inlining that condition N times only takes one typo'd copy (a
stray `role === "admin"` with the `owner ||` dropped) to silently lock the
Owner out of an action that's supposed to include them. A single helper
makes that bug class impossible to introduce by accident anywhere except
the one place it's defined, where it's easy to test once and trust
everywhere else — the same reason `requireBusinessOwner()` itself is a
shared function today rather than a role check copied into every owner-
gated route.

**Migration note:** Postgres enum extension via
`ALTER TYPE business_role ADD VALUE 'admin'` is what
`prisma migrate dev` will generate — safe, additive, no backfill needed.

### 1.2 What Admin gets in Settings

Not "Owner minus nothing," not "user-management only." The split:

| Settings tab | Admin? | Why |
|---|---|---|
| Team (member management) | **Yes** | The entire reason this tier exists. |
| Business profile | Yes | Operational/branding config — logo, address, contact info. No financial or legal exposure if changed. |
| Documents (template defaults, notes/terms) | Yes | Same category — day-to-day operational config an Admin should be able to run without looping in the Owner for every default-terms tweak. |
| Appearance | Yes | Cosmetic only. |
| Tax (GST/GSTIN/registration) | **No** | These fields carry real compliance weight — an incorrect GSTIN or registration type doesn't just look wrong, it's wrong on every invoice generated afterward, with actual filing consequences. This is squarely "the Owner's business, the Owner's liability." |
| Billing (not built yet, but named in the spec as owner-exclusive) | **No** | Direct financial exposure — payment method, subscription state. Highest-blast-radius category in the app; kept to the single person with the most skin in the game. |

The dividing line: **operational/branding/team-composition is delegable;
legal-compliance and financial configuration is not.** This also happens to
minimize blast radius — the tabs Admin can't touch are exactly the ones
where a mistake (or a compromised Admin account) can't be silently
corrected by re-editing a form; a wrong GSTIN has already gone out on real
invoices, a cancelled subscription has already lapsed.

Concretely, this means `GET/POST /api/business/members` and
`PATCH /api/business/members/[id]` (already shipped) move from
`requireBusinessOwner()` to the new `requireBusinessAdmin()`.
`PATCH /api/business/gst` and the business-profile/documents/appearance
PATCH routes: GST stays on `requireBusinessOwner()`, the rest move to
`requireBusinessAdmin()`.

### 1.3 Admin and the document-visibility hierarchy

**Recommendation: Admin sits outside the `reportsToId` tree entirely, the
same way Owner already does — unconditional document visibility, not a
subtree.**

This was the harder call, so the reasoning in full:

The rejected alternative — Admin gets a `reportsToId` position and is
subject to the exact same subtree computation as Staff — has one real
argument in its favor: it adds *zero* new special-casing to
`getDocumentVisibility()` (today, literally one line: `if (membership.role
=== "owner") return { isOwner: true, ... }`). Extending that condition to
`role === "owner" || role === "admin"` is a second line of the same shape,
which is not a large change, but it is a second thing to reason about.

I'm recommending it anyway, for a product reason that outweighs that: the
stated job of an Admin is company-wide member management — deactivating
anyone, reassigning anyone's manager, resolving "why can't this person see
their own invoice" support questions. All of that is *about* documents and
people the Admin may have no hierarchy relationship to at all. An Admin who
can deactivate the Senior Manager of a branch they don't personally manage,
but can't see that branch's own invoices to diagnose why someone's
complaining, is a worse admin experience than the marginal cost of one more
condition in `getDocumentVisibility()`. Practically, forcing Admin into the
tree would also mean the *only* way to give an Admin real company-wide
visibility is to make every top-level manager report to them directly —
which conflates "I want this person to have Admin-level oversight" with
"I want to restructure my actual org chart," two things that should be
independent decisions.

This is a direct, symmetric extension of the hierarchy doc's Fork B Option
A ("hierarchy governs visibility only among staff; Owner sees everything
unconditionally") — under three tiers, that becomes "hierarchy governs
visibility only among staff; Owner and Admin see everything
unconditionally." No new rule shape, just a second role landing in the
existing "sees everything" bucket.

**Named consequence, not a caveat to bury**: promoting someone to Admin is
a bigger visibility jump than it might sound like from the Settings-tab
table above — instant company-wide document visibility, comparable to what
making them the root of the reporting tree would do. An Owner choosing who
to promote to Admin should know that's part of the decision, not just "who
do I trust to manage the team."

### 1.4 Admin managing other Admins

Can an Admin invite another Admin, promote a Staff member to Admin, or
deactivate an existing Admin?

**Recommendation: yes to all three, symmetric peer management.** The
Owner is always the backstop — they can edit, demote, or deactivate any
Admin at any time (the existing PATCH route's only carve-out is the
Owner's *own* row, not other Admins' rows), so an Admin acting badly is
always correctable. Restricting this now, before there's evidence it's
needed, would just mean the Owner is a bottleneck for something they can
already unwind after the fact.

If you'd rather start stricter — Admins can invite/manage Staff, but only
the Owner can create or edit Admins — that's a one-line change to the
authorization check on the relevant routes (`role === "owner"` instead of
`requireBusinessAdmin()` specifically for admin-targeting actions) and
doesn't ripple anywhere else in this design. Flagging it here as the one
place I'd want your explicit sign-off if you want the tighter version
instead of my default.

---

## 2. Data model

New table, `Invitation`:

```prisma
enum InvitationStatus {
  pending
  accepted
  revoked
  expired

  @@map("invitation_status")
}

model Invitation {
  id         String @id @default(uuid())
  businessId String @map("business_id")

  // Stored as provided; every lookup/comparison against it is
  // case-insensitive (see §3, §4.3) rather than normalizing at write
  // time — matches the case-insensitive lookup already used in the
  // existing add-by-email route.
  email String

  // Never "owner" — there is exactly one Owner, set at business
  // creation; enforced in the create-invitation handler, not the schema.
  role BusinessRole @default(staff)

  // Both optional: pre-fill the new member's hierarchy position so the
  // inviter doesn't have to set it again right after acceptance. Same
  // validation as the existing PATCH /api/business/members/[id] — must
  // reference an existing, active, non-owner member of this business.
  // No cycle check needed here: the invitee isn't a node in the tree
  // yet, so a cycle is impossible until they accept.
  title       String?
  reportsToId String? @map("reports_to_id")

  tokenHash String @unique @map("token_hash")

  status InvitationStatus @default(pending)

  invitedByUserId   String  @map("invited_by_user_id")
  acceptedByUserId  String? @map("accepted_by_user_id")

  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  invitedBy  User     @relation("InvitationsSent", fields: [invitedByUserId], references: [id], onDelete: SetNull)
  acceptedBy User?    @relation("InvitationsAccepted", fields: [acceptedByUserId], references: [id], onDelete: SetNull)

  @@index([businessId])
  @@index([email])
  @@map("invitations")
}
```

`invitedByUserId`/`acceptedByUserId` use `SetNull`, mirroring
`Document.createdByUserId`'s precedent exactly: historical "who invited
this person" attribution shouldn't block deleting the inviter's own
account, and losing that one field on the (currently nonexistent) path of
deleting a `User` row is an acceptable trade — same call already made and
justified for documents.

**Uniqueness needs a partial index, not a plain `@@unique`.** A business
should be able to invite someone, have it expire or get declined, and
invite them again later — a blanket `@@unique([businessId, email])` would
permanently block that unless rows get deleted (which nothing else in this
app does — `isActive`, not deletion, is the standing convention). What
actually needs to be unique is "at most one **pending** invitation per
business+email," which Prisma's schema DSL can't express directly. This
needs a raw-SQL partial index in the migration:

```sql
CREATE UNIQUE INDEX invitations_pending_business_email_key
  ON invitations (business_id, lower(email))
  WHERE status = 'pending';
```

This closes the same class of race the `findOrCreateUserForIdentity` fix
already closed for `User` rows: two near-simultaneous invite-creation
requests for the same email can't both succeed — the DB, not
check-then-create app logic, is the arbiter. The create-invitation handler
should follow that function's existing pattern: attempt the insert, catch
the unique-violation, and on conflict fall through to the "resend" path
(§4.1) rather than surfacing a raw constraint error.

---

## 3. Token security

- **Generation**: `randomBytes(32).toString("hex")` — 256 bits. The
  existing `shareToken` (document public-share links) uses
  `randomBytes(24).toString("hex")`; I'd go slightly larger here
  specifically because this token grants account/business membership, a
  materially more sensitive action than a read-only document link, and the
  extra 8 bytes cost nothing.
- **Storage**: only `SHA-256(rawToken)` is ever written to `tokenHash`.
  The raw token exists in exactly two places, ever: the URL sent to the
  invitee, and the one API response at creation time that hands it back to
  the inviter for the copy-link fallback (§4.2). It is never persisted in
  plaintext anywhere, on the same standard as a password-reset token — a
  full database read (backup leak, injection elsewhere) can't be replayed
  into a working invite without also having captured the raw token in
  transit.
- **Lookup**: accept/inspect endpoints hash the incoming token and query
  by `tokenHash`, never by scanning/comparing raw values.
- **Expiry**: 7 days, checked as `status === "pending" && expiresAt > now`
  at read/accept time. Reasoning for the window: this app sends no
  reminder emails and has no background job runner, so a short window
  (e.g. 24h) would just generate silent failures for anyone who doesn't
  check their inbox same-day; 7 days absorbs normal delay without leaving
  a token live indefinitely. No cron is needed to flip expired rows to
  `status: expired` — it's computed lazily wherever an invitation is read.
  As a light housekeeping touch, `GET /api/business/invitations` can
  opportunistically flip any stale `pending`-but-past-`expiresAt` rows to
  `expired` before returning them, so the Team tab never shows a dead
  invite as "Pending" for a week after it actually died.
- **Single-use enforcement**: the accept transaction does a guarded
  update — `UPDATE invitations SET status = 'accepted', ... WHERE id = ?
  AND status = 'pending'` — and checks the affected-row count before doing
  anything else. Count 0 means someone else already consumed, expired, or
  revoked it in the interim; abort, no `BusinessMember` row gets created.
  Count 1 means this request won the race; proceed, inside the same DB
  transaction, to create/reactivate the membership row. This is the exact
  concurrency pattern already proven in this codebase for the
  `findOrCreateUserForIdentity` race (guard the write, don't
  check-then-write) — same tool, new place it's needed.
- **Revocation before acceptance**: Owner/Admin can revoke a pending
  invite from the Team tab; `status: pending → revoked`, only valid from
  `pending` (an already-accepted invitation isn't revoked — removing that
  *person* afterward is the existing `isActive` toggle on their
  `BusinessMember` row, a different action entirely). Revoked and expired
  tokens produce the same generic "no longer valid" response at
  lookup/accept time — not distinguished from each other, or from "token
  doesn't exist" — so a party holding a dead token can't learn *why* it's
  dead. Low-value defense given 256-bit tokens are already infeasible to
  guess, but free.

---

## 4. Full lifecycle

### 4.1 Creation

`POST /api/business/invitations`, `requireBusinessAdmin()`. Body:
`{ email, role: "staff" | "admin", title?, reportsToId? }`.

1. Reject `role: "owner"` outright — there is exactly one Owner, set at
   business creation, not transferable through this surface.
2. If `reportsToId` is provided, validate it references an existing,
   active, non-owner member of *this* business (same check the existing
   PATCH route already does).
3. Check for an existing **active** `BusinessMember` for this
   `(businessId, email)` → if found, 409 "already a member," same as
   today's add-by-email route.
4. Check for an existing **deactivated** `BusinessMember` for this
   `(businessId, userId)` — i.e. a former employee being re-invited. This
   matters because `BusinessMember` has `@@unique([businessId, userId])`:
   a person can only ever have *one* membership row per business, so
   accept can never create a second row for them. The invitation itself
   doesn't need to know this yet (it's keyed by email, and a former
   employee's `userId` isn't resolved until accept) — this is handled at
   accept time (§4.3), noted here so the two sections read as one
   coherent path rather than a gap.
5. Check for an existing **pending** invitation for this
   `(businessId, email)` (the partial unique index from §2 makes this
   authoritative, not just a courtesy check) → **resend, don't
   duplicate**: rotate `tokenHash` (the old link stops working — a
   deliberate choice, so there's never two simultaneously-valid tokens for
   one pending invite), reset `expiresAt` to `now + 7d`, update
   `role`/`title`/`reportsToId` if the inviter changed them, re-send the
   email. Response signals "resent" vs. "created" (200 vs. 201) so the UI
   can toast accordingly.
6. Otherwise, create the row. Response includes the **raw** token once
   (see §4.2) — the only time it's ever transmitted back.

### 4.2 The email, and the no-`RESEND_API_KEY` fallback

Same constraint already hit by the document Send feature: `RESEND_API_KEY`
isn't configured in this project. Send's existing behavior is to hard-block
— return a 400 and refuse the whole action. **Invitations must not follow
that pattern**, per your explicit requirement: creating an invitation and
its token must always succeed, independent of whether email delivery is
configured.

Concretely: `POST /api/business/invitations` always creates/updates the
`Invitation` row and always returns 200/201 with a `shareUrl`-style raw
link (`{origin}/invite/{rawToken}`) in the body — the copy-link affordance
in the Team tab is not conditional on Resend being configured. If
`RESEND_API_KEY` *is* set, the handler additionally attempts to send via
Resend (same client/pattern as `app/api/documents/[id]/send/route.ts`) and
the response also carries `emailSent: true|false` so the UI can say
"Invitation sent to jane@company.com" vs. "Invitation created — share this
link" — but the link is always shown either way. Even once email is
configured, "copy link and paste into Slack" is strictly more useful than
"wait for email," so there's no reason to hide it once it works.

If the Resend call itself fails (bad key, API outage), that's logged and
`emailSent: false` returned — it does **not** roll back the invitation
that was already created; the copy-link fallback covers exactly this case
too.

### 4.3 Accept flow

`GET /invite/[token]` — a public page (no `requireAuth()` gate; someone
needs to see *what* they're being invited to before deciding whether to
sign in). Hashes the token, resolves the invitation, and renders one of
five states:

1. **Token invalid/expired/revoked/already-accepted** — one generic
   "this invitation is no longer valid" message (§3's non-distinguishing
   choice), with a note to ask the inviter for a fresh one.
2. **Valid, visitor not signed in at all** — "{inviterName} invited you to
   join {businessName} as {role}." with a primary CTA into Clerk
   sign-in/sign-up, configured to redirect back to this exact
   `/invite/[token]` URL once auth completes (Clerk's redirect-URL
   support). The invited email can be passed through to Clerk's sign-up
   form as a prefill (a real UX nicety — reduces how often someone signs
   up under the wrong address by accident) but this is **not** enforcement
   — Clerk has no concept of our invitation semantics and won't stop
   someone from typing a different email. The actual enforcement happens
   after redirect, in state 4 below. (A harder alternative — Clerk
   Organizations, which *can* lock an invite to an email at the identity
   layer — is discussed and rejected in §9: this app doesn't model
   membership through Clerk at all today, and adopting it now would be a
   materially bigger architectural change than this feature calls for.)
3. **Valid, signed in as the wrong account** — explicit rejection, not a
   silent 404 or a silent accept: "This invitation was sent to
   jane@company.com, but you're signed in as bob@company.com. Sign out and
   sign in as jane@company.com to accept, or ask {inviterName} to resend
   it to the right address." with a Sign Out button. Showing the target
   email here is deliberate and safe (§6.1) — it doesn't reveal whether
   that address has an account anywhere, only what this specific
   invitation (which the viewer already possesses a link to) was addressed
   to.
4. **Valid, signed in as the matching account** — explicit confirm screen:
   "{inviterName} invited you to join {businessName} as {role}." with
   Accept / Decline. Not auto-accepted even on a perfect match — same
   safety-conscious posture as the strict-match requirement itself, it
   guards against stale/forwarded links being actioned by someone who
   didn't mean to, and it matches how Slack/GitHub/Notion all handle org
   invites (explicit confirmation is the norm, not silent join).
5. Decline → `POST /api/invitations/decline`, `status: pending → revoked`
   (recipient-initiated; no separate status value needed beyond the four
   you specified — see §9 for why I didn't add a fifth).

`POST /api/invitations/accept` — `requireAuth()` only (deliberately *not*
`requireBusiness()`, which would fail: the accepting user has no
membership in this business yet). Body `{ token }`.

1. Hash, look up, verify `status === "pending" && expiresAt > now`.
2. Verify `invitation.email` case-insensitively equals the signed-in
   user's email. Mismatch → 403 with the same message as page-state 3
   (the API is the actual enforcement point; the page-level check in §4.3
   state 3 is the UX for it, not a separate authority).
3. Transaction:
   - Guarded update `status: pending → accepted` (§3's race-safe
     single-use check); abort if 0 rows affected.
   - Look up an existing `BusinessMember` for `(businessId, userId)`:
     - **None exists** → create one: `role`/`title`/`reportsToId` from
       the invitation, `isActive: true`.
     - **Exists and deactivated** (the former-employee case flagged in
       §4.1) → **reactivate that row**: `isActive: true`, and update
       `role`/`title`/`reportsToId` to whatever this invitation specified
       (a rehire may come back at a different title/role than they left
       with). This is not "silently reactivating old access" — it only
       happens as the direct result of the person themselves accepting a
       fresh invitation an Owner/Admin just deliberately sent.
     - **Exists and active** — shouldn't be reachable (creation already
       blocks inviting an active member), but the transaction still
       checks and 409s defensively rather than silently overwriting an
       existing active membership's role/title.
4. Set the active-business cookie to this `businessId` (reusing whatever
   mechanism already sets it — business creation already establishes this
   pattern) so the person lands *inside* the business they just joined,
   not wherever their oldest membership happens to point.
5. Return `{ businessId }`; client redirects to `/dashboard`.

### 4.4 Interaction with the onboarding wizard

This is the one place I'd push back slightly on doing the obvious thing.

The obvious approach — silently redirect a person with a pending
invitation straight into accepting it — contradicts the strict-match
decision's own spirit: if we're not willing to silently join someone under
the wrong account, we shouldn't silently join them under the *right*
account either, without them seeing what they're agreeing to. So: **always
land on the explicit accept/decline screen (§4.3 state 4), never
auto-accept**, regardless of how someone arrived there.

The real question is arrival path, not confirmation. Someone who clicks
the emailed link arrives at `/invite/[token]` directly and everything in
§4.3 applies as written. But someone who never clicks the link — signs up
cold via `/sign-up`, or already has an account and just logs in — needs a
second entry point, or their pending invitation is invisible to them and
they either stumble into `/onboarding` and create an unwanted second
business, or never learn the invitation exists at all.

I found the right interception point by reading the actual code rather
than guessing: `NoBusinessError → /onboarding` is a **single, chokepoint
redirect** (`requireBusinessForPage()`, `lib/auth/page.ts:36`) that every
brand-new user passes through no matter how they authenticated — direct
sign-up, Google OAuth, whatever Clerk flow. `/onboarding`'s own page
component (`app/onboarding/page.tsx`) already runs a `businessMember`
lookup before deciding what to render. That's the one place to add a
check: before falling through to the wizard, look up
`Invitation.findMany({ where: { email: user.email, status: "pending" } })`
(case-insensitive). If any exist, redirect to a new `/invitations` page —
a list of every pending invite for this email (there could legitimately be
more than one — two different companies inviting the same person is rare
but not invalid), each with its own Accept/Decline, reusing the same
accept endpoint as `/invite/[token]`. Only if they decline everything (or
none exist) do they ever see the "create your own business" wizard.

This means: **no new interception point needs to be added to Clerk's own
redirect configuration** — the existing chokepoint already covers every
arrival path, because it's keyed on "does this user have zero business
memberships," which is exactly the population that needs the invitation
check.

---

## 5. API surface

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/business/invitations` | `requireBusinessAdmin()` | Create, or resend if one's already pending for that email (§4.1) |
| `GET /api/business/invitations` | `requireBusinessAdmin()` | List all invitations for the business, any status (Team tab renders pending prominently, rest as history) |
| `POST /api/business/invitations/[id]/revoke` | `requireBusinessAdmin()` | Revoke a pending invitation (dedicated action-verb endpoint, matching the existing `mark-paid`/`send`/`share` convention rather than a generic PATCH-with-status-body) |
| `GET /invite/[token]` (page, not API) | none / `requireAuth()` conditionally | Resolve token → render one of the 5 states in §4.3 |
| `POST /api/invitations/accept` | `requireAuth()` | Accept — the strict-match check, the transaction in §4.3 |
| `POST /api/invitations/decline` | `requireAuth()` | Decline — `pending → revoked` |
| `GET /invitations` (page) | `requireAuthForPage()` | The "arrived without the link" list from §4.4 |

Existing routes that need their auth check widened from
`requireBusinessOwner()` to the new `requireBusinessAdmin()`, per §1.2:
`GET/POST /api/business/members`, `PATCH /api/business/members/[id]`
(this one also gains an optional `role: "staff" | "admin"` field, so
Owner/Admin can promote or demote post-hoc, not just set role at invite
time), business-profile PATCH, documents-defaults PATCH, appearance PATCH.
`PATCH /api/business/gst` stays `requireBusinessOwner()`-only.

---

## 6. Security risks and edge cases

### 6.1 Email enumeration

Two distinct surfaces, both fine, but worth confirming explicitly rather
than asserting:

- **Invite creation.** Unlike the mechanism it replaces — which 404'd if
  the target email had no existing `User` row, a real (low-stakes, since
  it required already being an Owner) enumeration oracle — this design
  never checks "does a `User` exist for this email" at creation time at
  all. Invitations are addressed to an email and resolved to a `User`
  (existing or brand-new) only at accept. Creation reveals nothing about
  account existence. Net improvement over what's shipped today, not just
  a neutral change.
- **Accept-flow mismatch message.** Confirmed safe in §4.3 state 3: it
  only restates the invitation's own known target back to someone who
  already possesses a link to that specific invitation (a 256-bit random
  token, hashed at rest — not guessable, not enumerable). It doesn't leak
  whether that address has an account anywhere else.
- **Generic invalid-token response.** §3's choice to never distinguish
  "doesn't exist" from "expired" from "revoked" costs nothing and closes
  even the theoretical probing angle.

### 6.2 Rate limiting

This app has no rate limiting anywhere today, and invitations are a
genuinely new abuse surface on top of that gap — not a place to just note
the gap and move on, since the person triggering it here is an
authenticated Owner/Admin (or, on the accept side, anyone with a token),
not an anonymous stranger:

- **Per-inviter**: an Owner/Admin could spam-invite an external address
  repeatedly (using this app's email sending as a relay for harassment) or
  fan out invite attempts across many candidate addresses to farm the
  active/pending/available signal.
- **Per-target-email**: one address could be hit by many different
  inviters/businesses.
- **Accept/lookup endpoints**: unauthenticated-reachable (`GET
  /invite/[token]`), so worth a floor of IP-based throttling as
  defense-in-depth even though 256-bit tokens make brute-forcing
  infeasible regardless.

This stack has no cache/queue layer (no Redis, nothing beyond Next.js +
Supabase Postgres) — an in-memory counter would not survive a
multi-instance or serverless deployment, so the honest option is a small
**Postgres-backed fixed-window counter**, not a full rate-limiting
framework:

- A minimal table (bucket key + window start + count), checked and
  incremented before the real write, in the same transaction.
- Concrete thresholds to start with: 20 invitation-creations/hour per
  inviter, 5 invitations/day per target email across all businesses, 30
  requests/hour per IP on the public accept/lookup endpoints. These are
  starting points, easy to tune once real usage exists — the important
  part is that *something* backs the invitation-creation and accept
  endpoints specifically before this ships, not that the exact numbers are
  final.

Scoped deliberately to this feature. App-wide rate limiting (login
attempts, etc.) is a separate, pre-existing gap this doc isn't trying to
close.

### 6.3 Other edge cases

- **Business deleted with invitations pending** — cascades via the FK,
  nothing orphaned.
- **Inviter deactivated/removed after sending, before accept** — the
  invitation stays valid; it's tied to the business, not to the inviter's
  continued membership. Considered auto-revoking an Admin's outstanding
  invites when that Admin is deactivated, and rejected it — adds
  complexity for a case any remaining Owner/Admin can already handle with
  a manual revoke if it's actually a problem.
- **Revoke and accept racing each other** — handled by the same
  guarded-update mechanism as double-accept (§3): whichever write reaches
  Postgres first wins, the other's guarded update affects 0 rows and
  reports "no longer valid." No application-level locking needed.
- **Same email invited to unrelated businesses** — no interaction;
  invitations are business-scoped, this is expected and fine.
- **Admin inviting/promoting another Admin** — addressed in §1.4; default
  is allowed, with the tighter Owner-only alternative named as a one-line
  change if you want it instead.

---

## 7. Changes required to already-shipped code

This session already built `GET/POST /api/business/members`,
`PATCH /api/business/members/[id]`, and the Team tab. This proposal:

- Widens all three routes' auth from `requireBusinessOwner()` to
  `requireBusinessAdmin()`.
- Extends the PATCH route to accept `role: "staff" | "admin"`.
- **Recommends removing `POST /api/business/members`** (the add-by-email
  path) once invitations ship — it's strictly superseded (handles both
  existing- and new-user cases, plus real ownership verification via
  email match) and leaving both live would mean two different "add a
  person" flows with different guarantees, which is more confusing than
  useful. Not urgent to do in the same change, but flagging it now so it
  doesn't get forgotten as intentional debt.
- The Team tab's pending-invitations list is new UI, additive to what's
  there — the existing member list/edit rows don't change shape.

---

## 8. Open questions — resolved, one line each

1. **Where does Admin live in the schema?** Extend `role` to
   `owner | admin | staff` (§1.1).
2. **Does Admin sit in the `reportsToId` tree?** No — outside it,
   unconditional visibility, same as Owner (§1.3).
3. **Multi-business membership on accept?** Confirmed: exactly the
   existing pattern, accept just creates (or reactivates) one
   `BusinessMember` row, untouched elsewhere (§4.3).
4. **Onboarding wizard vs. pending invite?** Explicit accept/decline
   screen always, both via the direct link and via a new interstitial
   hooked into the existing `NoBusinessError → /onboarding` chokepoint for
   anyone who arrives without clicking the link (§4.4).

---

## 9. Explicitly out of scope / rejected alternatives

- **Clerk Organizations** as the invitation mechanism instead of this
  app's own `Invitation` table. Clerk Orgs can enforce email-locking at
  the identity layer, which is strictly stronger than this design's
  post-auth check — but this app doesn't model business membership through
  Clerk anywhere today (`BusinessMember` is entirely our own table); adopting
  Orgs now would mean re-deriving multi-business membership, role, and the
  whole hierarchy feature on top of a different primitive. Worth
  revisiting only if Clerk Orgs becomes the actual membership model
  app-wide, which is a much bigger decision than this feature.
- **A fifth `declined` status**, distinct from `revoked`. You specified
  four lifecycle states; recipient-declining and Admin-revoking are both
  "no longer pending, nothing left to do with it," so both just set
  `revoked`. If it ever matters *who* ended it, that's a smaller add
  (a nullable `endedByUserId` or similar) than a new enum value, and
  nothing in the current requirements needs the distinction.
- **Auto-revoking an Admin's outstanding invites on their own
  deactivation** — named and rejected in §6.3.
- **General app-wide rate limiting** — out of scope; §6.2 only proposes
  what this specific new surface needs.
