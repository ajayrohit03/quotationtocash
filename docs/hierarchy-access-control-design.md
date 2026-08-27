# Org-hierarchy access control for invoices/quotations — design proposal

Status: **draft for review — no implementation yet.**
Scope: `Document` (quotations + invoices) only. Customers and Products remain business-wide, unchanged.

---

## 0. Key design insight, up front

The four access levels in the requirement —

- Sales Executive: own only
- Manager: own + direct Sales Executives
- Senior Manager: own + entire downward subtree
- CEO: everything

— are **all the same rule** applied at different tree positions:

> A user can see a document if they created it, or if the creator sits anywhere in their downward reporting subtree.

A Sales Executive's subtree is just themselves (no reports), so "own + subtree" degenerates to "own only." A Manager's subtree is themselves + their direct Sales Executives. A Senior Manager's subtree is themselves + their Managers + those Managers' Sales Executives. There's no need for four special-cased rules, four role checks, or anything that hard-codes "Manager" or "Senior Manager" as strings. **One rule, computed against tree position, reproduces the entire access table.**

This matters beyond elegance: it means the system doesn't need to know what a "Senior Manager" is, doesn't break if a company has 3 levels or 8, and doesn't need updating when someone invents a new title. The only thing that has to be correct is the reporting edge between two people. Everything else falls out.

CEO ("view everything") is the one tier that doesn't fit this pattern for free — a pure subtree rule only gives the CEO "everything below them," which only equals "everything" if they're the sole root of a single connected tree. Section 7 addresses this directly: I'm recommending "view everything" stay tied to the **existing, already-tested** `BusinessMember.role = owner`, not be inferred from tree shape. More below.

---

## 1. Database model for the hierarchy

**Recommendation: adjacency list (a single self-referential `reportsToId` column), with subtree resolution done at query time — not a closure table or materialized path.**

### Why adjacency list, not closure table or materialized path

| | Adjacency list | Closure table | Materialized path |
|---|---|---|---|
| Move one person to a new manager | 1 row updated | Every ancestor/descendant pair touching the moved node's old and new position (can be many rows) | Every descendant's path rewritten (can be many rows) |
| Move a whole subtree (a Manager + their team, under a new Senior Manager) | **1 row updated** (only the Manager's own edge — their reports come along automatically because *their* edges didn't change) | Full pair recomputation for the moved node and everything below it | Full path rewrite for every node below the moved node |
| Read "give me X's subtree" | Recursive walk (cheap at this scale, see below) | Single indexed join, O(1) | Prefix match, O(1) |
| Risk of a bad write leaving stale/wrong permissions | Low — one row, one transaction | **Higher** — multi-row rewrite must be complete and correct every time, or a permission is silently wrong | Higher, same reason |
| Implementation complexity | Low | Medium–high (write path) | Medium (write path, string handling) |

The stated scale is 100+ users with org depth of maybe 5–6 levels, and the explicit requirement is that re-orgs, promotions, and manager changes are **routine, ongoing operations**, not rare one-time events. That combination — frequent structural writes, modest read volume, bounded depth — is exactly the case where adjacency list wins: the write path is a single-row update no matter how large the subtree being moved is, so there's no multi-row rewrite step that could partially fail and leave stale grants behind. Closure tables and materialized paths earn their keep when reads vastly outnumber writes and the hierarchy is close to static (e.g., a product catalog category tree) — the opposite of what's being described here.

Postgres's `WITH RECURSIVE` handles adjacency-list subtree queries natively and efficiently at this scale (hundreds to low thousands of rows, single-digit tree depth) — this isn't a workaround, it's the standard tool for the job.

**If the business later grows to thousands of members with heavy read traffic** and subtree resolution becomes a measurable cost, the upgrade path is to add a *maintained* closure table as a read-optimization cache — but it would be rebuilt from the adjacency list (the source of truth), never hand-maintained incrementally, so a bug in the cache-update logic can't produce a wrong permission, only a stale one until the next rebuild. I don't recommend building this now; it's premature at the stated scale.

### Schema change

Add two columns directly to the existing `BusinessMember` table (not a new table — see reasoning below):

```prisma
model BusinessMember {
  id         String       @id @default(uuid())
  businessId String       @map("business_id")
  userId     String       @map("user_id")
  role       BusinessRole @default(staff)

  // New:
  reportsToId String?         @map("reports_to_id")
  title       String?         // free text — display only, never used for authorization (see §0)
  isActive    Boolean  @default(true) @map("is_active")   // see §5, departures

  reportsTo     BusinessMember?  @relation("ReportsTo", fields: [reportsToId], references: [id])
  directReports BusinessMember[] @relation("ReportsTo")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([businessId, userId])
  @@index([userId])
  @@index([businessId, reportsToId])   // makes subtree resolution fast
  @@map("business_members")
}
```

**Why extend `BusinessMember` instead of a new `OrgPosition` table:** `BusinessMember` already *is* "this person, in this business." A separate table would exist purely to hold two columns and would need its own 1:1 join to `BusinessMember` for every access check, for no real separation-of-concerns benefit — nothing in the requirement calls for a person to have a reporting position independent of their business membership, or multiple simultaneous hierarchies. If that ever changes (e.g., a matrix org with a "dotted line" hierarchy alongside the direct-report one), split it out then; doing it now is speculative.

**`title` is free text, not an enum.** Titles vary by company and, per §0, are never load-bearing for access decisions — only display. Hard-coding "Sales Executive / Manager / Senior Manager / CEO" as an enum would tie the schema to one company's naming and would need a migration every time a business uses different titles.

**Integrity constraints that need app-level enforcement** (Postgres/Prisma can't express these declaratively):

- `reportsToId` must point to a `BusinessMember` in the **same business**. A raw FK can't express "same business as me" as a constraint; this must be checked in the API handler that changes it (fetch the target, compare `businessId`, reject on mismatch).
- **No cycles.** Before writing a new `reportsToId`, walk upward from the proposed manager; if the walk reaches the person being reassigned, reject. This also catches the trivial self-reference case (`reportsToId = own id`).
- Recommend `onDelete: Restrict` on the `reportsTo` relation at the DB level, so a `BusinessMember` row can never be hard-deleted while it still has direct reports pointing at it — forces an explicit reassignment first rather than silently orphaning people. (This is a backstop; the real removal path is deactivation, not deletion — see §5.)

---

## 2. Users, businesses, roles, reporting — how they fit together

- **`User`** — unchanged. A person's identity, independent of any business.
- **`Business`** — unchanged. A tenant.
- **`BusinessMember`** — the join row, already carries `role` (owner/staff — the existing, tested settings-permission axis) and now *also* carries `reportsToId`/`title`/`isActive` (the new, independent document-visibility axis). See §7 for why these two axes stay separate rather than being merged.
- A `User` can belong to multiple businesses (already true today), and their hierarchy position is **per business** — `reportsToId` lives on `BusinessMember`, which is already business-scoped, so a person can be a Manager at Company A and an individual contributor at Company B with zero extra modeling. This falls out of the existing structure for free.
- The hierarchy is a forest, not necessarily a single tree: any `BusinessMember` with `reportsToId = null` is a root of its own subtree. Multiple simultaneous roots are allowed (e.g., two co-founders) — see §7 for why "sees everything" is *not* inferred from being a root, precisely because two unrelated roots shouldn't see each other's branches under a pure subtree rule.

---

## 3. Document ownership/creator — field and migration plan

### New field

```prisma
model Document {
  // ...existing fields...
  createdByUserId String? @map("created_by_user_id")
  createdBy       User?   @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)
}
```

- References **`User`, not `BusinessMember`.** A document's creator is a stable identity; `BusinessMember` rows may be deactivated (§5) and referencing `User` directly means historical attribution never depends on a membership row surviving. Resolving "is this creator in my subtree" still requires joining to that user's `BusinessMember` row for *this* document's `businessId` — but that join is needed either way, so referencing `User` isn't materially more complex, and it's more durable.
- `onDelete: SetNull`, not `Cascade` or `Restrict` — if a `User` row is ever actually deleted (not just deactivated), historical documents shouldn't vanish or block the deletion; they just lose the attribution, which folds into the same "legacy/unattributed" handling described next.
- Nullable, and going forward it's **always set** at document-creation time (the creating request already knows the authenticated user) — so after this ships, `NULL` only ever means "created before this feature existed."

### Migration/backfill plan — the part worth getting right

The tempting default — "attribute every existing document to the business owner" — turns out to be **wrong** under the subtree rule, and worth walking through explicitly because the reasoning matters for §6 too.

If legacy documents were attributed to the Owner, and the Owner sits at the *root* of the tree, then under "creator must be in viewer's subtree," those documents would become visible to **the Owner only** — nobody else's subtree contains the root, since a subtree only extends downward. That's the opposite of today's behavior, where **every** business member (owner or staff) can already see **every** document — there's no per-user filtering anywhere in the app today, only business-level scoping. So naively backfilling to the owner would be a silent, sweeping *access reduction* for all existing staff the moment this ships, based on a fabricated attribution we have no actual evidence for.

**Recommendation: leave `createdByUserId` as `NULL` for every pre-existing document. Do not fabricate an attribution.** Then make the authorization rule treat `NULL` explicitly:

> Visible if: `createdByUserId IS NULL` (legacy — visible business-wide, same as today) **OR** viewer's role is `owner` **OR** `createdByUserId` is in the viewer's subtree.

This has three properties worth calling out:

1. **Zero regression for existing data.** Nobody loses access to anything they could see yesterday, because legacy documents keep exactly today's visibility (everyone) instead of being reassigned to a narrower, made-up owner.
2. **It's honest.** We don't actually know who created a pre-migration document (the field never existed), so the system doesn't pretend to know. The UI can show "—" or "Created before hierarchy tracking" rather than a specific name that might be wrong.
3. **It's self-cleaning.** Every document created after the migration always has a real `createdByUserId` (set at creation, never null going forward), so the `NULL` case is inherently temporary — it only describes the pre-migration backlog, which shrinks in relevance over time as new, correctly-attributed documents accumulate.

If the business later knows (from memory, external records, etc.) who really created specific historical documents, backfilling `createdByUserId` on those *specific* rows is a safe, optional, one-off follow-up — at that point it's real data, not a fabricated default, and the general migration doesn't need to wait on it.

---

## 4. How authorization determines visibility — query-time, not cached

**Recommendation: compute the viewer's subtree at query time, on every request. Never cache "user X can see document Y."**

### Why not cache the access decision

The explicit requirement is "access must automatically update when the hierarchy changes — no manual re-permissioning step." Caching *the hierarchy itself* (as discussed in §1, a future closure-table option) is safe because it's rebuilt from a single source of truth. Caching *access decisions* (materializing "user X can see documents {a, b, c}") is a different and much riskier thing — it means every reporting change, promotion, or departure has to correctly invalidate every affected cached decision, across every affected user, which is exactly the kind of "manual re-permissioning step" (even if automated) that's easy to get subtly wrong — miss one invalidation path and someone either loses access they should have or, worse, keeps access they shouldn't. Computing live avoids the entire class of bug by never having a stale copy to invalidate in the first place.

### How the resolution actually works

1. Fetch all `BusinessMember` rows for the business (`id`, `userId`, `reportsToId`) — bounded by business size (hundreds of rows even at real scale), cheap.
2. Walk from the viewer's own `BusinessMember.id` downward (BFS/DFS over `reportsToId`) to collect the set of `userId`s in their subtree, including themselves.
3. Query documents: `businessId` matches, **and** (`createdByUserId IS NULL` **or** `createdByUserId IN (subtree user ids)` **or** viewer is `owner`).

This is a plain, pure, easily-unit-testable function (`resolveSubtreeMemberIds(edges, viewerId) -> Set<userId>`) — no database, no framework, matching how this codebase has consistently preferred to build and test its authorization/calculation logic (e.g. `lib/documents/status.ts`, `lib/tax/calculateGST.ts`). It can be tested with plain edge lists and no mocking, and separately there'd be one real-DB integration test proving it against actual `BusinessMember` rows, matching the existing test style for this codebase's other authorization code (`lib/auth/__tests__/require-business-owner.test.ts` is the direct precedent).

Per-request memoization (not cross-request caching) via React's `cache()` — the same pattern already used for `requireBusiness()` in `lib/auth/session.ts` — avoids redundant work if multiple components on one page need the subtree, without ever persisting a decision past the single request it was computed for.

**Indexes**: `BusinessMember(businessId, reportsToId)` (added in §1) makes the traversal cheap even done as raw recursive SQL later; `Document(businessId, createdByUserId)` makes the final filter join cheap regardless of which resolution strategy is used.

**If this ever needs to move into the database** (very large member counts, or wanting to push the whole thing into one SQL query rather than app-level traversal), the natural next step is a `WITH RECURSIVE` CTE over the same adjacency-list data — same source of truth, just executed differently. This is a performance escalation path, not a correctness one; nothing about the access *semantics* changes.

---

## 5. Change scenarios

All of these share one property: because visibility is computed live (§4), **there is no recompute step, ever.** The next query after a write always reflects the new state. What differs per scenario is which row(s) get written.

| Scenario | What gets written | Blast radius | When access updates |
|---|---|---|---|
| **Promotion** (title change only, e.g. Sales Executive → Manager, no new reports yet) | `title` on their own row | 0 other rows | N/A — no access change until they're actually given reports |
| **Promotion with new direct reports** | `reportsToId` on each newly-assigned report | 1 row per report reassigned | Immediately, next query |
| **Manager moves to a different Senior Manager** | `reportsToId` on the Manager's own row **only** | **1 row** — their existing reports' rows are untouched; their subtree moves with them automatically because *their* edges to the Manager didn't change | Immediately, next query |
| **User removed / departs** | `isActive = false` on their row (not deleted — see below) | 0 other rows required immediately; their direct reports *should* eventually be reassigned to someone active, as a deliberate follow-up action, not an automatic side effect | Their own login access revoked immediately (separate mechanism, see below); their historical documents remain visible to whoever is currently above them in the tree, unaffected |
| **Manager demoted / reports taken away** | `reportsToId` changed on the *reports* (moved to someone else), not on the demoted manager | 1 row per reassigned report | **Immediately** — their very next query reflects the smaller subtree. See §6 for the important caveat about existing client-side state and why every document-reading endpoint must independently re-check this, not just the list page. |

### Departing users, specifically (the question the brief asks directly)

Two distinct concerns, deliberately decoupled:

1. **Can they still log in / act as themselves?** No — revoked immediately, via `isActive = false` checked in the same place `requireBusiness()`/`requireAuth()` already gate every request, plus (recommended) disabling their Clerk account so the two layers agree, matching this codebase's established double-guard habit (UI + server, never just one).
2. **What happens to documents they created?** Nothing — `createdByUserId` is untouched. They remain exactly where they were in the tree (just flagged inactive), so whoever currently sits above them still sees their documents through the unchanged reporting edge, with zero extra work. Their *direct reports* don't lose their own position either — they still point at the deactivated person, and inherit whatever's above *them* unchanged, until a human deliberately reassigns them to a new manager. This is intentionally a separate, unhurried HR action rather than something the deactivation flow forces synchronously — reassignment picked in a rush is a more likely source of a wrong permission than reassignment done deliberately later.

I'm recommending **soft-delete (`isActive`) over hard-delete** specifically because hard-deleting a `BusinessMember` forces an immediate answer to "what happens to their reports and their historical documents' referential integrity" at the exact moment someone is being offboarded — usually not a good time to be making structural decisions under time pressure. `Restrict` on the FK backs this up: a hard delete simply can't happen while direct reports still point at the row.

---

## 6. Security risks and edge cases

**Fail closed, not open.** A `BusinessMember` with `reportsToId = null` and `role = staff` (e.g., a new hire whose manager hasn't been set yet) has a subtree of exactly themselves — the *safest* possible default, not the most permissive. Nothing in this design silently grants broad access when data is missing; missing data means "sees only their own," never "sees everything."

**Cycles.** Prevented at write time (§1) by walking the proposed new manager's ancestor chain before accepting the change. As a second layer, the subtree-resolution traversal itself should cap depth (e.g., 50 levels) so that if a cycle ever did slip through some other write path, the query terminates safely rather than looping — the same belt-and-suspenders instinct already used elsewhere in this codebase (client-side guard *and* server-side check, never just one).

**Demotion — immediate, confirmed.** Because nothing is cached, a demoted manager's very next request reflects their new, smaller subtree. The one real caveat: if they have a browser tab already open with a list of documents rendered from *before* the demotion, that in-memory list doesn't retroactively un-render itself. This is only a real problem if a stale client-rendered link could still be used to reach a document server-side — which is why the important part isn't the list page, it's making sure **every document-reading endpoint independently re-checks the current subtree**, not just the one that renders the list. This app has hit this exact class of gap multiple times already (draft-lock enforcement, owner-only settings) — a UI-level guard that isn't backed by the same check on every server endpoint that touches the resource. Concretely, the following existing routes all currently scope only by `businessId` and would each need the same subtree check added:

- `GET /api/documents` (list) and the `document-list-page.tsx` / dashboard queries — filter, not just gate
- `GET /api/documents/:id`, `PATCH /api/documents/:id`, `DELETE /api/documents/:id`
- `POST /api/documents/:id/convert`, `/mark-paid`, `/send`, `/share`, `/pdf`
- `document-editor-page.tsx` and `document-preview-page.tsx` (the page-level fetches, same pattern as the API routes)

**Not** in scope for this check: `GET /public/documents/:token` and its `/pdf` sibling. Those are intentionally unauthenticated and token-gated — a share link is meant to be visible to whoever holds the link, which has nothing to do with internal reporting structure.

**Promotion — also immediate, and cuts both ways.** The same "always live" property that makes demotion take effect instantly also means a promotion (or a re-org that expands someone's subtree) grants the *new* access immediately too. Worth stating explicitly since it's the same mechanism producing both directions — there's no asymmetry to worry about.

**Multi-tenancy.** The subtree resolution must always be scoped to one `businessId` and must never resolve across businesses — this is a restatement of the rule already enforced everywhere else in this codebase ("never fetch by id alone, always scope by business"), extended to the new hierarchy table.

**Cross-business `reportsToId`.** Covered in §1 — must be validated at write time; nothing in the FK alone prevents pointing at a member row from a different business.

**Owner impersonation / blast radius.** No new risk here — owners already see everything today (pre-migration), so nothing changes for that tier.

---

## 7. The two explicit forks

### Fork A — view-only vs. edit/reassign

**Recommendation: view-only for the initial version.**

Reasoning:

- Editing raises questions this requirement doesn't answer and that deserve their own deliberate design pass: does an edit by a manager change `createdByUserId`? (It shouldn't — that would corrupt historical attribution.) Would need a separate `lastEditedByUserId` to distinguish "who created this" from "who last touched it" — real scope growth beyond what's been asked for.
- This app already has a hardened, tested draft-lock system (`requireEditableDocument`, `isEditableStatus`) that governs editability by *document status*, completely independent of *who's* asking. Layering hierarchy-based edit rights on top means reasoning about the interaction between two authorization dimensions on a piece of the system that's been deliberately hardened across several earlier rounds of testing — real risk for a feature that wasn't asked for yet.
- The app's whole design ethos leans toward historical accountability and immutability (frozen snapshots, frozen totals, "never trust stale client state") — silent multi-editor access to a subordinate's draft cuts against that unless it's scoped very deliberately.
- View-only directly serves the stated use case (oversight/reporting — a manager wanting visibility into their team's pipeline), without opening the harder question.

If edit access is wanted later, I'd recommend a **"reassign to me"** action rather than shared multi-editor access to the same document: a manager can explicitly reassign `createdByUserId` (already anyone in their subtree by definition, since they can already see it), an auditable, deliberate, single action, rather than ambiguous concurrent-edit rights. That's a small, additive extension of exactly the model proposed here, not a redesign — worth keeping in mind as the natural next step, but a separate decision from this one.

### Fork B — how this relates to Owner/Staff

**Recommendation: Option A.**

**Option A — CEO = Owner; hierarchy applies within Staff.** `role = owner` keeps its exact current meaning, completely unchanged: sees/manages everything, and is the only role that can touch business/tax/billing settings (the already-hardened `requireBusinessOwner()` boundary, untouched by any of this). `reportsToId`/`title` govern visibility *among* `role = staff` members. CEO in the example maps directly to an Owner-role member. This is the option that changes the least tested surface area, has the simplest mental model ("Owner still means what it always meant"), and requires zero changes to Phase 10's owner-only settings enforcement.
*Minor note:* the schema already permits more than one `owner`-role member per business (not uniquely constrained), so "we have both a CEO and a CFO who both need to see everything" is already supported without any change — both would just be `role = owner`.

**Option B — replace Owner/Staff with the tiered system entirely**, deriving business-settings permissions from hierarchy position too. **Not recommended.** This discards a proven, already-tested security boundary for no benefit the current requirement actually asks for — the brief is about *document* visibility, not business-settings permissions, and re-deriving `requireBusinessOwner()`'s guarantees from a brand-new tree structure means re-earning that hardening from scratch. High risk, no requested upside.

**Option C — two fully independent axes**, where "sees everything" is its own explicit flag (e.g. `BusinessMember.hasCompanyWideDocumentVisibility: Boolean`) rather than reusing `role = owner`. This is Option A's flexibility taken one step further: it would allow, hypothetically, granting full document visibility to someone who isn't the Owner, or an Owner who doesn't want full visibility (unlikely, but decoupled if wanted). Worth considering only if you anticipate wanting that decoupling — otherwise it's an extra field solving a problem Option A doesn't currently have. I'd treat this as the fallback if Option A's "CEO must literally be the Owner" assumption turns out to be wrong for how this company (or later customers) actually want to model things.

---

## Summary of recommendations

1. Adjacency list (`BusinessMember.reportsToId`) as the single source of truth; subtree resolved live, not cached or pre-materialized.
2. `title` as free text, never used in authorization logic — access is pure tree position.
3. `Document.createdByUserId` (nullable, references `User`); **do not backfill existing documents** — leave `NULL`, and treat `NULL` as "visible business-wide," preserving today's actual behavior for all existing data rather than fabricating attribution.
4. Compute visibility per-request via a pure, testable subtree function; per-request memoization only, never cross-request caching.
5. Every change scenario is a single-row (or small, bounded) write with no recompute step; access is always immediately correct on the next query, in both directions (gain and loss).
6. Fail closed by default (no manager = sees only own); departing users are deactivated, not deleted, decoupling "can they log in" from "what happens to their documents"; every existing single-document route needs the same subtree check the list page gets, not just the list page.
7. Ship view-only first; keep `role = owner` as the untouched "sees everything" mechanism and layer hierarchy visibility underneath it for staff.

Open questions for you to confirm before any implementation starts:
- Confirm Option A for Fork B (or pick B/C).
- Confirm view-only for Fork A (or ask for the "reassign to me" variant to be scoped now instead of later).
- Confirm the no-backfill (`NULL` = business-wide legacy visibility) approach for existing documents, since it differs from the "attribute to the owner" example in the original brief.
