# Permission-Oriented Authorization Layer — Design Proposal

Status: **proposal, not implemented**. Small in scope relative to
[`hierarchy-access-control-design.md`](./hierarchy-access-control-design.md)
and [`invitation-onboarding-design.md`](./invitation-onboarding-design.md)
— this formalizes and lightly extends what those two already built,
rather than introducing new infrastructure.

## 0. Core insight: permission and scope are independent axes

`requirePermission('quotations.edit')` answers *can this person touch
quotations at all*. The existing `reportsToId` subtree logic — already
built, tested, and live-verified with real accounts — answers *which
ones*. These were always two different questions in the code; this doc
just names them.

The clarifying consequence of keeping them separate: **Manager, once
derived, adds exactly one new permission string (`reports.view`) and
nothing else.** Every other capability Manager has over
quotations/invoices — `view`/`create`/`edit`/`delete` — is a permission
Staff already has too. The entire practical difference between Manager
and Staff is what scope those shared permissions resolve to (team vs.
own), not which permissions exist. That's the proof the two-axis model is
the right shape here: collapsing them into one string per role (e.g. a
`"quotations.edit.team"` permission) would have meant inventing a
combinatorial catalog entry for every action×scope pairing, when scope is
really an orthogonal question the subtree logic already answers on its
own.

## 1. Current-state audit — two real findings, not hypothetical

Before designing anything new, I checked what's actually gated today
rather than trusting memory of what was intended. Two things don't match
what was decided:

**Finding A — mutate routes reuse the view-scope check, granting more
than Fork A intended.** `documentVisibilityWhere()` was retrofitted
identically into `GET`, `PATCH`, `DELETE`, `convert`, `mark-paid`,
`send`, and `share` — every one of them, view and mutation alike, gated
by the exact same "can I see this document" subtree check. The hierarchy
design doc's Fork A explicitly decided *view-only first*, with
"reassign to me" as the deliberate, narrower path to real edit access —
specifically to avoid shared multi-editor state corrupting historical
attribution. That decision was never actually enforced: today, anyone
who already qualifies as "Manager" under this doc's own definition
(staff with ≥1 active direct report) can already edit, delete, convert,
mark-paid, and send their entire subtree's documents in place. Nobody
reviewed this as a decision — it's a side effect of one function being
reused everywhere convenient. §5 below closes this by giving mutation
its own, narrower scope resolver.

**Finding B — two routes are still owner-only despite the UI already
treating them as Admin-accessible.** `POST/DELETE /api/business/logo`
and `POST /api/business/complete-onboarding` both still call
`requireBusinessOwner()` — missed when Business profile/Documents/
Appearance were widened to `requireBusinessAdmin()` during the
invitation work. The practical effect: `business-profile-tab.tsx`
already renders the logo upload/replace/remove buttons as enabled for an
Admin (`readOnly={!isAdmin}`), but clicking them 403s, because the
underlying route still checks for `role === "owner"` specifically — a
button that looks live but isn't, the same *shape* of bug as the
fieldset-disabled issue from Settings, just inverted (looks enabled,
isn't). Both belong under `organization.manage` once that permission
exists (§2) — logo is literally part of the Business profile tab it's
already grouped with, and completing onboarding is a one-time
operational bookkeeping action with no financial or legal weight.

Neither finding is large in current blast radius — this feature is
new and lightly used so far — but both are exactly the kind of gap
that's bitten this project before by staying quiet until real usage
finds them. §8 treats fixing both as part of this work, not a
follow-up.

## 2. The permission catalog

```ts
export const PERMISSIONS = [
  "quotations.view", "quotations.create", "quotations.edit", "quotations.delete",
  "invoices.view",   "invoices.create",   "invoices.edit",   "invoices.delete",
  "customers.view",  "customers.create",  "customers.edit",  "customers.delete",
  "products.view",   "products.create",   "products.edit",   "products.delete",
  "reports.view",
  "users.manage",
  "organization.manage",
  "organization.tax",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
```

Quotations and invoices get separate permission strings even though
today every role that has one has all four of the other's siblings too
(no fixed role currently wants "can create quotations but not invoices")
— kept distinct specifically so a future custom role can split them
without a schema or catalog change, per the "cheap to extend later"
requirement. Customers/products stay in the catalog for the same
future-proofing reason, but their *scope* is always all-business,
never subtree-restricted — unchanged from today, per the hierarchy
doc's explicit boundary that customer/product data stays business-wide
for everyone.

**How a future module adds to this**: append new permission strings to
the array, add them to whichever role constants below should have them.
`reports.view` already demonstrates the pattern — it's seeded now, gates
nothing yet (no route checks it — Reports doesn't exist as a feature),
and exists purely so the Reports module doesn't have to design its own
gate later; it reuses this catalog and, when it needs record-level
scoping, the same `own`/`team`/`all` machinery documents already use.

### Role → permission sets

```ts
const STAFF_PERMISSIONS: readonly Permission[] = [
  "quotations.view", "quotations.create", "quotations.edit", "quotations.delete",
  "invoices.view",   "invoices.create",   "invoices.edit",   "invoices.delete",
  "customers.view",  "customers.create",  "customers.edit",  "customers.delete",
  "products.view",   "products.create",   "products.edit",   "products.delete",
];

// The only permission Manager adds on top of Staff's set — see §0.
const MANAGER_ONLY_PERMISSIONS: readonly Permission[] = ["reports.view"];

// Named, explicit, and the one place to add the next exclusion — not a
// prose comment to rediscover later.
const ADMIN_EXCLUDED_PERMISSIONS: readonly Permission[] = [
  "organization.tax",
  // When a billing feature exists, its permission goes here too.
  // When ownership-transfer/remove-owner exists as a real action, its
  // permission goes here too. Neither exists yet, so neither gets a
  // catalog entry today — don't add permission strings for actions that
  // don't exist. This comment is the rule; keep it current when either
  // ships.
];
```

- **Owner**: every permission in `PERMISSIONS`. Untouched —
  `requireBusinessOwner()` stays exactly as hardened as it already is.
- **Admin**: every permission except `ADMIN_EXCLUDED_PERMISSIONS`.
  Concretely, today, that's Tax and only Tax — already built, already
  live-tested. `users.manage` and `organization.manage` are both in
  Admin's set (Team management is the reason Admin exists; Business
  profile/Documents/Appearance are operational, per the invitation
  doc's §1.2 reasoning, restated here as the actual catalog entries that
  implement it).
- **Manager**: `STAFF_PERMISSIONS` ∪ `MANAGER_ONLY_PERMISSIONS`. Not a
  stored role — see §4.
- **Staff**: `STAFF_PERMISSIONS`. No `reports.view`, no `users.manage`,
  no `organization.*`. This tier's permission set is unchanged from
  today.

## 3. `requirePermission()` — signature and composition with scope

```ts
// lib/auth/permissions.ts
export async function requirePermission(
  permission: Permission,
): Promise<BusinessContext> {
  const context = await requireBusiness();
  if (!(await hasPermission(context, permission))) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
  return context;
}
```

A route composes this with scope as two genuinely separate calls — never
merged into one function that returns a pre-filtered `where`:

```ts
// Illustrative, not the actual PATCH handler:
const context = await requirePermission("quotations.edit"); // can they edit quotations at all?
const scope = await documentScopeWhere("mutate");            // which ones, specifically?
const existing = await prisma.document.findFirst({
  where: { id, businessId: context.business.id, ...scope },
});
```

`requirePermission()` never touches the subtree/scope logic, and
`documentScopeWhere()` never touches the permission catalog — swapping
either implementation independently is the whole point of keeping them
apart.

`requireBusinessOwner()` and `requireBusinessAdmin()` stay exactly as
they are — they're coarser, pre-existing checks that some routes (GST,
Team management's own membership-editing endpoints) still use directly
because they're not permission-per-record questions. `requirePermission()`
doesn't replace them; it's the finer-grained sibling for anything that
maps to a catalog entry.

## 4. Manager as a derived fact, not a stored role

Confirmed per your instinct: **derived, not a fourth `role` enum value.**
`BusinessMember.role` stays `owner | admin | staff` — no schema change.

```ts
// lib/auth/permissions.ts — memoized per-request, same pattern as
// requireBusiness()'s own cache() wrapping, so multiple permission
// checks in one request don't repeat the query.
export const isManager = cache(async (membershipId: string): Promise<boolean> => {
  const directReportCount = await prisma.businessMember.count({
    where: { reportsToId: membershipId, isActive: true },
  });
  return directReportCount > 0;
});
```

This can never drift out of sync with the `reportsToId` data it reads,
because it isn't stored anywhere else to drift *from* — there is no
second copy of "is Manager" to go stale. The moment someone gains or
loses their last active direct report, `isManager()` reflects it on the
very next request, with zero migration, zero manual reassignment step,
and zero reference to update. This is the same "computed live, never
cached as a separate fact" discipline `documentVisibilityWhere()` itself
already follows for subtree resolution — Manager-detection is one more
live computation over the same underlying edges, not a new redundant
state to keep synchronized.

`hasPermission()` only ever calls `isManager()` for a `staff`-role
membership checking a `MANAGER_ONLY_PERMISSIONS` entry — Owner and Admin
short-circuit before it's ever invoked, so the extra query is paid only
by the population it actually matters for.

## 5. Scope: view vs. mutate, and the "reassign to me" action

Two scope tiers per action type, not one shared tier:

```ts
export type ScopeAction = "view" | "mutate";

export async function documentScopeWhere(
  action: ScopeAction,
): Promise<Prisma.DocumentWhereInput> {
  const visibility = await getDocumentVisibility();
  if (visibility.seesAllDocuments) return {}; // owner, admin — unchanged

  if (action === "view") {
    return subtreeWhere(visibility); // unchanged — today's documentVisibilityWhere() logic, renamed
  }

  // action === "mutate": own only, full stop. Team scope never applies
  // directly to a write, for anyone, Manager included — this is
  // Finding A's fix. "Reassign to me" (below) is the sole bridge from
  // "I can see it" to "I can edit it."
  return { createdByUserId: visibility.viewerUserId };
}
```

Deliberately **not** `isManager() ? team : own` for the mutate case —
that was the tempting middle ground, and it's the option I'm not
recommending. It would restore exactly the shape of access Finding A
flagged as never having been a reviewed decision, just moved the
decision point from "accidental" to "deliberate but still broad." The
original Fork A reasoning (avoid shared multi-editor state, avoid
attribution corruption, avoid interacting with the draft-lock system)
argued specifically against blanket team-mutate access; honoring that
means mutate-scope stays `own` unconditionally, and Manager's edit
reach comes entirely through the explicit reassignment action below —
never as an ambient grant.

### The reassignment action

```
POST /api/documents/[id]/reassign
```

- Permission: `requirePermission("quotations.edit")` or
  `("invoices.edit")` by document type.
- Scope: the document must be in the caller's **view** scope
  (`documentScopeWhere("view")`) — this is what makes it meaningful only
  for Manager/Owner/Admin over someone else's document; calling it on
  your own document is a harmless no-op.
- Effect: `createdByUserId` is set to the caller's own user id, inside a
  transaction. After this single write, the document is the caller's
  own document under every existing rule — the mutate-scope check above
  now passes normally, with zero special-casing added to `PATCH`,
  `DELETE`, `convert`, `mark-paid`, or `send`.
- Recommended restriction: only from `status: draft` — matching this
  app's existing `requireEditableDocument()` discipline (once something
  has been sent/paid/converted, "take over editing it" isn't really the
  use case; reassignment for record-correction on a non-draft document is
  a different feature this doc isn't proposing). Flagging this as a
  recommendation, not a settled call — worth your explicit confirmation
  since it wasn't spelled out in the original Fork A note.

**Named tradeoff, not a silently accepted side effect**: the original
hierarchy doc was deliberately careful never to *fabricate* creator
attribution — that's exactly why legacy documents keep `createdByUserId:
NULL` instead of being backfilled to the Owner. Reassignment is a
different kind of event: a real, explicit, human-initiated action that
does overwrite the previous attribution, permanently. That's not the
same violation — nothing is being invented, a real transfer is being
recorded — but it does mean the *original* creator's name is gone after
a reassignment, not archived anywhere. An audit trail (a
`reassignedFromUserId` field, or a log entry) would preserve it, but
nothing in the current requirements calls for one, and building it now
would be exactly the kind of speculative infrastructure this project has
avoided elsewhere without a stated need. Naming it here so it's a visible
decision if you want to revisit it, not a gap that gets rediscovered
later.

## 6. Route/page classification

Every existing document-touching route/page, reclassified under the new
two-tier scope model (view unchanged; mutate newly narrowed per Finding
A):

| Route/page | Scope today | Scope under this design |
|---|---|---|
| `GET /api/documents`, `GET /api/documents/[id]` | subtree | **view** — unchanged |
| `document-list-page.tsx`, `document-preview-page.tsx` | subtree | **view** — unchanged |
| `lib/documents/aggregates.ts` (dashboard) | subtree | **view** — unchanged |
| `GET /api/documents/[id]/pdf` | subtree | **view** — no write happens here at all, downloading a subordinate's PDF doesn't require reassigning it first |
| `document-editor-page.tsx` (the builder's own fetch) | subtree | **mutate** — see note below |
| `PATCH/DELETE /api/documents/[id]` | subtree | **mutate** |
| `POST /api/documents/[id]/convert` | subtree | **mutate** |
| `POST /api/documents/[id]/mark-paid` | subtree | **mutate** |
| `POST /api/documents/[id]/send` | subtree | **mutate** (judgment call — sending is external-facing and does write `sentAt`/`status`; flagging for your confirmation rather than asserting it's obviously right) |
| `POST /api/documents/[id]/share` | subtree | **mutate** (writes a new `shareToken`; low-stakes but still a write, same reasoning as `send`) |

**Why the builder's own page fetch needs to move to mutate-scope, not
stay on view-scope**: today it uses the same subtree check as everything
else, so a Manager can currently open a subordinate's document in the
editable builder — the page loads fine. If mutate-scope narrows per this
doc but the builder's initial fetch doesn't move with it, autosave would
start silently 403ing in the background the moment they type anything,
which is a worse experience than never having gotten in. Moving the
builder's fetch to mutate-scope means a Manager who tries to open a
subordinate's document there gets routed to the read-only preview
instead (which stays on view-scope) — consistent, not silently broken.

Customer/Product routes are unaffected — they were never subtree-scoped
to begin with (business-wide for everyone, per the hierarchy doc's own
boundary) and stay that way.

## 7. Team tab — additive only, no new page

No permission-matrix builder, per your instruction. The existing Team
tab already covers invite/role/title/reportsToId/deactivate. The one
addition once §5's reassignment action ships: a "Reassign to me" button
surfaced wherever a Manager is looking at a subordinate's document in
the UI (the document list/preview, not the Team tab itself — the Team
tab manages *people*, this action operates on *documents*, so it belongs
next to the document, gated by the same `requirePermission` +
view-scope check the API enforces). Nothing about the Team tab's own
layout needs to change for this design.

## 8. Migration/compatibility note

Not literally "zero behavior change" once the audit in §1 is accounted
for honestly — three real changes, all small, all deliberate:

1. **Mutate-scope narrows** for anyone who currently qualifies as
   Manager (staff with ≥1 active direct report) — they lose blanket
   in-place edit/delete/mark-paid/convert/send access to their
   subtree's documents, gaining the explicit reassignment action in its
   place. This tightens Finding A's accidental grant back to what Fork A
   actually decided. Given the hierarchy feature is new and still
   lightly used, the real-world blast radius right now is likely small
   to none — the right time to fix it is before usage grows, not after.
2. **Admin gains** logo upload/remove and complete-onboarding (Finding
   B) — small, additive, corrects a mismatch between what the UI already
   implied and what the API actually allowed.
3. **Everything else is genuinely unchanged**: Owner keeps full access;
   Staff-without-reports keeps exactly today's own-scope-only view and
   edit behavior (their mutate-scope was already effectively "own" since
   their subtree is just themselves — this design doesn't change their
   observed behavior at all); Customers/Products stay business-wide for
   everyone; Tax stays Owner-only.

## 9. Open decisions for you to confirm

1. `send` and `share` classified as mutate-scope (§6) — reasonable
   default, not an obviously-forced call.
2. Reassignment restricted to `status: draft` documents only (§5) —
   recommended, not explicitly specified in the original Fork A note.
3. No audit trail for the attribution overwritten by reassignment (§5)
   — recommended against building one now, absent a stated need.
4. Fixing Finding A (mutate-scope narrowing) and Finding B (the two
   owner-only routes) as part of this same implementation pass, rather
   than as separate follow-up work — recommended, since both are small
   and this doc is the natural place to close them.
