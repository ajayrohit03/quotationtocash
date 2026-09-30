# Accounts Payable Phase 2 — Job P&L Design Proposal

Status: **draft, for review**. A `Job` entity that groups sales
documents (quotation/invoice/proforma) and purchase invoices together
for per-shipment profit & loss: what was billed to the customer vs.
what was paid to vendors for that job. Written against the live
schema/code as of this commit — every claim below about "the existing
X" was confirmed by reading `prisma/schema.prisma`,
`lib/auth/permissions.ts`, `lib/documents/aggregates.ts`,
`lib/documents/status.ts`, `components/documents/document-builder.tsx`,
`components/purchase-invoices/purchase-invoice-builder.tsx`,
`app/(app)/purchase-invoices/[id]/page.tsx`,
`app/(app)/customers/page.tsx`, `components/layout/sidebar-nav.tsx`,
and `docs/accounts-payable-phase1-design.md`, not assumed.

**No coding started.** This is a proposal only, per the request.

---

## 0. What already exists, and what's genuinely new

Read first, so nothing below assumes a field that isn't there:

- **`PurchaseInvoice.jobRef`** (`schema.prisma` line 424) already
  exists — a free-text `String?` shipment-reference field, part of the
  fixed shipment-details block added in AP Phase 1 (design doc §1.4).
  It has never been validated against anything, never linked to any
  other record, and is typed in by hand on every purchase invoice
  independently. Nothing on `Document` has an equivalent — quotations/
  invoices/proformas have no job-reference field of any kind today.
- **No `Job` model, no `jobId` column anywhere, no job-aggregation
  logic anywhere.** This entire feature is additive.
- **The aggregation precedent already exists**, and Job P&L should
  copy its shape exactly: `lib/documents/aggregates.ts`'s
  `getCustomersBillingSummaries()` — a batched `prisma.document.groupBy`
  keyed by the foreign id, filtered `type: "invoice"`, summing `total`
  (and `amountPaid` for the outstanding-balance case), scoped through
  `documentScopeWhere("view")` so a non-owner viewer's totals only ever
  reflect invoices they can actually see. Job P&L's "linked invoices"
  aggregate is the same query shape with `jobId` as the group key
  instead of `customerId`, run once for `Document` (sales side) and
  once for `PurchaseInvoice` (cost side, scoped through the AP-side
  equivalent, `purchaseInvoiceScopeWhere("view")`).

---

## 1. Data model

### 1.1 `Job` — new model

```prisma
enum JobStatus {
  open
  closed

  @@map("job_status")
}

model Job {
  id         String @id @default(uuid())
  businessId String @map("business_id")

  // The primary human-readable identifier — freight's own job-reference
  // convention (e.g. "TUT/0292/0926/SE"), typed in by the user, not
  // generated. Deliberately NOT unique per business: real operations
  // occasionally reuse or lightly vary a reference (a corrected job, a
  // re-quote under the same shipment reference) and nothing here should
  // silently reject that — same reasoning
  // PurchaseInvoice.vendorInvoiceNumber's own comment gives for not
  // being unique.
  jobRef String @map("job_ref")

  description String?

  status JobStatus @default(open)

  createdByUserId String?  @map("created_by_user_id")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  business  Business   @relation(fields: [businessId], references: [id], onDelete: Cascade)
  createdBy User?      @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)
  documents Document[]
  purchaseInvoices PurchaseInvoice[]

  @@index([businessId])
  @@index([businessId, status])
  @@map("jobs")
}
```

**Confirmed by reading the code, not assumed:** the request's proposed
field list (id, businessId, jobRef, description, status, createdAt) is
sufficient — nothing else on `PurchaseInvoice` or `Document` implies a
Job needs more than this. Two additions beyond the literal request,
both matching established precedent rather than inventing new shape:

- `createdByUserId` — every other business-owned entity with a
  creation event (`Document`, `PurchaseInvoice`) carries this for
  historical attribution (`onDelete: SetNull`, same rationale each
  time: a removed user shouldn't take history down with them). A Job
  is no different.
- `updatedAt` — Prisma's own `@updatedAt` convenience, present on
  every other model in this schema without exception.

**No `dates` field (start/end/expected-completion).** The request's
own field list doesn't ask for one, and nothing in the freight
shipment-details block (`vesselVoyage`, `sailedDate`, `portOfLoading`,
etc. — all on `PurchaseInvoice`, per-invoice) implies a job-level date
range belongs on `Job` itself rather than being read off whichever
purchase invoice actually carries the shipment's real dates. Out of
scope for Phase 2 (§9) — a real "job timeline" feature, if ever
wanted, is better designed once there's a concrete need for it, not
spec'd blind now.

### 1.2 `jobId` on `Document` and `PurchaseInvoice` — nullable FKs

```prisma
// On Document:
jobId String? @map("job_id")
job   Job?    @relation(fields: [jobId], references: [id], onDelete: SetNull)

// On PurchaseInvoice:
jobId String? @map("job_id")
job   Job?    @relation(fields: [jobId], references: [id], onDelete: SetNull)
```

`onDelete: SetNull`, not `Restrict` or `Cascade` — a Job is a grouping
label, not a record either side depends on for correctness (unlike
`PurchaseInvoice.vendorId`'s `Restrict`, which exists because a
purchase invoice with no vendor is nonsensical). If a Job is ever
deleted, its linked documents/purchase invoices should simply become
unlinked, not disappear or block the deletion. Both nullable: the
overwhelming majority of documents and purchase invoices have no job
association today and won't gain one automatically — linking is
always an explicit user action (§5), never inferred.

**Why `jobId` on `Document`, not a job-scoped variant of the existing
`referenceNumber` field:** `Document.referenceNumber` (free text, "e.g.
a PO number or project code") already exists and is deliberately
freeform/unvalidated. Overloading it to also mean "job link" would
conflate two different concepts — a PO number a customer gave you
is not the same thing as an internal job grouping — and would make a
real Job link just as unreliable as free text (typos, inconsistent
formatting, no actual referential integrity). A real FK is the only
way `documents.length`/`total` sums per job are trustworthy.

### 1.3 Migrations

Three migrations, in dependency order, mirroring AP Phase 1 §1.7's own
staging reasoning:

1. `add_job` — creates `job_status` enum and `jobs` table. No
   dependents yet.
2. `add_job_id_to_document` — adds nullable `job_id` + FK to
   `documents`. Depends on `jobs` existing.
3. `add_job_id_to_purchase_invoice` — adds nullable `job_id` + FK to
   `purchase_invoices`. Depends on `jobs` existing (independent of
   migration 2, but run in this order for a consistent story).

Each is a pure `CREATE TABLE`/`ALTER TABLE ADD COLUMN` — no existing
column altered, no backfill, no data-migration risk, same as every
migration in AP Phase 1.

---

## 2. Navigation

Agreed with the request's own proposal: **"Jobs" sits between Vendors
and Products** in the sidebar (`components/layout/sidebar-nav.tsx`'s
`NAV_ITEMS`), not as a top-level workflow section. Reasoning, confirmed
by reading the current nav order (Dashboard → Quotations → Invoices →
Proforma invoices → Purchase invoices → Customers → Vendors →
Products → Settings):

- The existing grouping is already "sales documents, then the two
  counterparty-management sections back to back (Customers, Vendors),
  then Products." A Job is neither a document type nor a
  counterparty — it's a cross-cutting label applied *to* documents,
  the same category Products already occupies (a thing documents
  reference, not a document itself).
- Jobs specifically follow Vendors rather than preceding Customers,
  because a Job only becomes meaningful once both a customer-facing
  document and a vendor-facing purchase invoice exist to link — it's
  conceptually "downstream" of both counterparty types, and its own
  detail page (§4) reads as a summary *combining* what's already
  visible on a Customer's and a Vendor's own document-history tables.

```
Dashboard
Quotations
Invoices
Proforma invoices
Purchase invoices
Customers
Vendors
Jobs        ← new
Products
Settings
```

No dashboard quick action ("Add job") proposed for Phase 2 — unlike
Vendor/Purchase-invoice creation, a Job is typically created *from*
the linking UI (§5) at the moment a user first needs to tag a document
to a shipment reference that doesn't exist yet (a "+ Add new job"
inline option in the selector, same `QuickAddCustomerDialog`-shaped
pattern `CustomerPicker` already uses), not from a dashboard shortcut
as its own standalone workflow entry point. The Jobs list page itself
still gets its own "Add job" button for the case of pre-creating a job
before any document exists.

---

## 3. Job list page

Mirrors `app/(app)/customers/page.tsx`'s structure closely (Suspense
shell + `TutorialBanner` + search + table, dynamically-imported "Add"
dialog) — confirmed by reading that file. Columns, per the request's
own list, all achievable from the aggregation shape in §0:

| Column | Source |
|---|---|
| Job Ref | `Job.jobRef` |
| Description | `Job.description` (— if empty) |
| Status | `Job.status` (Open/Closed badge, reusing `StatusBadge`'s existing color-by-string convention) |
| # sales invoices | `count` from the `Document` groupBy, `type: "invoice"` only (see §7's own reasoning for why quotations/proforma are excluded from this count and the totals below, even though they can still be *linked*) |
| Total billed | `sum(total)` from the same groupBy |
| # purchase invoices | `count` from the `PurchaseInvoice` groupBy |
| Total cost | `sum(total)` from the same groupBy |
| Margin | Total billed − Total cost |
| Margin % | Margin / Total billed × 100 (— when Total billed is 0, avoiding a divide-by-zero) |

Search: job ref + description, same `contains`/`insensitive` pattern
customers/vendors search already use.

**A visibility nuance worth stating explicitly, not left implicit:**
the Job row itself (ref, description, status) is visible to every
viewer with `jobs.view` (§6) — a Job is a shared reference construct
like a Vendor, not creator-scoped data. But the *aggregated figures*
next to it (counts, totals, margin) are computed through the same
`documentScopeWhere("view")` / `purchaseInvoiceScopeWhere("view")`
hierarchy scoping the underlying documents already have (§0). A Staff
member without subtree visibility into some of a job's linked invoices
will see a real Job row with a lower "Total billed"/"# sales invoices"
than an Owner sees for the identical job — the row isn't hidden, but
its numbers are scoped, exactly the way `getCustomersBillingSummaries`
already behaves for a Customer's own totals today. This is a direct
consequence of reusing the existing scoping functions rather than
inventing a job-specific one, and is called out here so it's a
deliberate, understood behavior rather than a surprise found later.

---

## 4. Job detail page — the P&L view

Mirrors `app/(app)/purchase-invoices/[id]/page.tsx`'s structure
(confirmed by reading it): header with status badge + actions, a row
of stat cards, then content tables, in that order.

```
┌─────────────────────────────────────────────┐
│ TUT/0292/0926/SE                    [Open]   │  ← header: jobRef + status badge
│ Description text, if any                     │
│                                    [Edit] [Close job] │
├─────────────────────────────────────────────┤
│  Total billed  │  Total cost  │  Gross margin │  ← 3-stat row, same
│  ₹X             │  ₹Y          │  ₹Z (P%)      │     Card grid as
└─────────────────────────────────────────────┘     purchase-invoice detail

  Sales invoices                                    ← table: Number,
  ────────────────────────────────────────           Type, Customer,
  [linked Document rows]                              Status, Amount

  Purchase invoices                                  ← table: Vendor,
  ────────────────────────────────────────           Invoice No., Status,
  [linked PurchaseInvoice rows]                       Total, Paid, Balance
```

- **Header**: `jobRef`, description, a Open/Closed `StatusBadge`, and
  actions — Edit (ref/description, always available) and Close job/
  Reopen job (a plain status toggle, not a one-way door like AP Phase
  1's `approved` — see §6 for who can do this).
- **Sales side table**: every `Document` with `jobId` = this job,
  columns Number, Type (quotation/invoice/proforma — shown, not
  filtered out of the *list*, even though only `invoice` rows count
  toward the P&L sum, per §7), Customer name, Status
  (`StatusBadge`, reusing the existing status-string rendering),
  Amount (`total`). Linking straight to `/quotations/:id`,
  `/invoices/:id`, or `/proforma-invoices/:id` per `type` — same
  `type === "quotation" ? "quotations" : "invoices"`-shaped routing
  the Customer detail page's own document-history table already does.
- **Purchase side table**: every `PurchaseInvoice` with this `jobId`,
  columns Vendor name, Vendor Invoice No., Status, Total,
  Amount Paid, Balance (`total − amountPaid`) — the same columns the
  Purchase Invoices list page (`app/(app)/purchase-invoices/page.tsx`)
  already shows per row, reused here.
- **Summary**: Total billed / Total cost / Gross margin / Margin % —
  the exact same aggregate the list page's row shows (§3), just
  computed for this one job instead of batched across all of them.

No PDF export, no "download the P&L" proposed for Phase 2 — this is an
internal reporting view with no external audience, same "no public
surface" reasoning AP Phase 1's own §0/§3/§6 already gave for purchase
invoices generally.

---

## 5. Linking UI

### 5.1 On the Document builder (quotation/invoice/proforma)

A **Job selector**, same interaction pattern as `CustomerPicker`
(confirmed by reading `document-builder.tsx` lines ~487–500: it's the
first field in the builder's left column, above the "Document
details" card). Proposed placement: **inside the existing "Document
details" card** (`document-builder.tsx` line ~500), as a new field
next to "Reference number" — not a separate top-level picker like
`CustomerPicker` gets, because a Job link is optional/occasional
metadata for most documents (a job-linked shipment invoice is a
minority case; most quotations/invoices have no job), whereas Customer
is mandatory for every document. A `JobPicker` component, mirroring
`CustomerPicker`'s own shape (search-and-select combobox, "+ Add new
job" inline via a `QuickAddJobDialog`), but rendered as one more grid
cell in "Document details" rather than promoted to its own card.

### 5.2 On the Purchase Invoice builder

**Keep the existing free-text `jobRef` field, and add an optional Job
link alongside it — do not replace one with the other.** Reasoning,
directly addressing the request's own question:

- `jobRef` (free text) is a **shipment-operational field** — it's
  what appears on the vendor's own paper invoice, typed in verbatim
  as part of faithfully recording what the vendor actually printed
  (same "typed in from the paper/PDF in hand" rule the whole
  shipment-details block follows, design doc §1.4/§5). A vendor's
  invoice showing "Job: TUT-0292" should be entered as "TUT-0292"
  regardless of whether a `Job` entity with that exact ref exists yet,
  the same way `vendorInvoiceNumber` is recorded verbatim regardless
  of our own numbering.
- The **Job link** (`jobId`) is the internal grouping/reporting
  construct — it may or may not match `jobRef` character-for-character
  (a vendor's own reference formatting is not guaranteed to match this
  business's internal job-ref convention), and it's what actually
  drives the P&L aggregation in §3/§4, not the free-text field.
- Practically: when a user picks a Job via the new selector and that
  Job's own `jobRef` doesn't match what's already typed into the
  free-text field, **do nothing automatic** — no auto-fill, no
  overwrite. Silently changing a field that's meant to faithfully
  transcribe the vendor's own paper would violate that field's whole
  purpose. If the user wants them to match, they type it themselves.

Placement: `purchase-invoice-builder.tsx`'s existing "Shipment
details" card already has a `jobRef` text field in its fixed grid
(confirmed by reading that file — it's one of the 22 shipment fields,
§1.4). Add the new **Job selector as its own field in the "Vendor &
invoice details" card** (next to Vendor/Currency, not inside Shipment
details) — this keeps it visually distinct from the free-text
shipment fields and signals it's a different *kind* of field (a real
link, not a transcribed value), consistent with how `Document`'s own
selector placement (§5.1) sits in a "details" card rather than the
free-text-heavy sections.

### 5.3 `JobPicker` component

One new shared component (`components/jobs/job-picker.tsx`), used by
both builders — same shape as `CustomerPicker`/`VendorPicker`-style
combobox already established: search a business's own `Job` list by
`jobRef`, select one, or "+ Add new job" inline (name + optional
description, same `QuickAddCustomerDialog`-shaped dynamic-imported
dialog pattern). Always optional — no document or purchase invoice
requires a Job link, and nothing about existing document/purchase-
invoice creation flows changes for the (expected to remain common)
case where no job applies.

---

## 6. Permissions

Read `lib/auth/permissions.ts` before proposing (full catalog, current
as of this commit): the flat `PERMISSIONS` array, `STAFF_PERMISSIONS`
granting most of it outright, `MANAGER_ONLY_PERMISSIONS` a
single-entry list (`reports.view`, notably still unused by any real
page — confirmed via search, nothing in the app currently gates on
it), and `purchase_invoices.pay` as the one AP Phase 1 permission that
deliberately sits outside `STAFF_PERMISSIONS` (owner/admin only).

**Proposed: a new flat CRUD set, same tier as Vendor/Customer
management — added to `STAFF_PERMISSIONS`, not gated behind
`reports.view` or restricted to owner/admin:**

```ts
"jobs.view", "jobs.create", "jobs.edit", "jobs.delete",
```

Reasoning for *not* reusing `reports.view` (the one existing
permission that could plausibly fit a "financial summary" feature):
`reports.view` is Manager-only-on-top-of-Staff (§0 of the hierarchy
design already establishes this as the *one* permission Manager adds).
Gating Job P&L behind it would mean ordinary Staff — who can already
freely create purchase invoices, see vendor payment balances, and see
a customer's own total-invoiced/outstanding figures on the Customer
detail page (`getCustomerBillingSummary`, no special permission today)
— suddenly couldn't see a job's billed/cost/margin summary, which is
just a recombination of numbers they can already see individually on
the linked documents' own pages. That's a real access-control
regression relative to what Staff can already piece together by hand,
not a meaningful new protection. Reusing the flat-CRUD-tier pattern
(matching `vendors.*`/`purchase_invoices.*`) is the honest default,
not a tightened one invented without cause — same standard AP Phase
1 §8 already set for itself.

**No separate "close job" permission.** `jobs.edit` covers it — same
reasoning AP Phase 1 gave for reusing one tier rather than minting a
new permission for a closely-related action "unless product feedback
later shows a real need to grant it independently" (design doc §8,
verbatim). Closing a job is materially lower-stakes than approving a
purchase invoice for payment (§8's actual owner/admin-only case) — it
doesn't move money, it's a bookkeeping/reporting state, so there's no
equivalent argument for tightening it beyond ordinary edit access.

**Visibility scope**: per §3's own nuance, the `Job` row itself is
**not** hierarchy-scoped (visible business-wide to anyone with
`jobs.view`, same as Vendor/Customer/Product today — none of those are
creator-scoped either). Only the linked-invoice aggregates inherit
scoping, via the existing `documentScopeWhere`/
`purchaseInvoiceScopeWhere` functions, reused directly — no new scope
function needed for `Job` itself.

---

## 7. The P&L calculation

Confirmed by reading `schema.prisma`: `Document.total` and
`PurchaseInvoice.total` are each the single, already-computed grand
total for their document — `Document.total` is server-computed in
`PATCH /api/documents/:id` (never trusted from the client, per the
existing spec rule) and reflects rounding when `roundTotal` is on
(schema's own comment: "`total` above already reflects the rounded
figure... it's what remainingBalance/payments compare against, so the
amount actually invoiced must be the amount actually collectable").
`PurchaseInvoice.total` is the identical pattern from AP Phase 1 §1.2.
Both are exactly the right fields to sum — no recomputation needed,
matching the "frozen, already-computed" convention `getDashboardMetrics`
already relies on for revenue figures.

**Billed** = `sum(Document.total)` where `jobId` = this job, **`type
= "invoice"` only**, excluding `status = "cancelled"`.

This is a deliberate narrowing of the request's own phrasing ("sum of
total on linked sales invoices"), stated explicitly because it matters:
a **quotation** is not yet billed to anyone — summing its `total`
into "Total billed" would overstate real revenue for a job that's
only been quoted, not invoiced. A **proforma** is, per AP Phase 1's
own `PROFORMA_STATUSES` comment, explicitly "a pre-shipment/approval
document, not a tax invoice" — also not real billing. Both quotation
and proforma documents **can still be linked** to a Job (§5.1 places
no restriction on `type`) and **do appear** in the Job detail page's
sales-side table (§4) for reference/visibility, but neither
contributes to the "Total billed" sum or the list page's own totals
column. Only `type = "invoice"` is real billing. (Quotations have no
`"cancelled"` status in their own vocabulary — `QUOTATION_STATUSES`
has no such value — so this exclusion is moot for them regardless;
proforma does have `"cancelled"`, same as invoice.)

**Cost** = `sum(PurchaseInvoice.total)` where `jobId` = this job,
excluding `status = "cancelled"`. No type-filtering needed here — every
`PurchaseInvoice` is, by construction, a real vendor bill (there's no
purchase-side equivalent of "quotation" or "proforma" — AP Phase 1
never built one, and none is proposed here).

**Margin** = Billed − Cost. **Margin %** = Margin ÷ Billed × 100, shown
as "—" (not `0%`/`NaN%`/`Infinity%`) when Billed is 0 — a job with
purchase invoices but no sales invoice yet (cost incurred before
billing catches up, a realistic sequencing in freight) should read as
"no margin % yet," not a misleading `-100%` or a crashed render.

**Draft invoices count.** Unlike `getCustomersBillingSummaries`'s
`INVOICED_STATUSES` (which excludes `draft` — reasoning there: "a
draft isn't billed yet"), Job P&L's Billed sum includes every invoice
status except `cancelled`, **including `draft`**. This diverges from
that existing precedent deliberately: Job P&L is an internal
cost-tracking view answering "what does this shipment actually cost
us, right now," not a customer-facing "how much have I formally billed
this customer" figure. A drafted-but-not-yet-sent invoice still
represents a real line item in the job's own economics the moment
someone building the invoice enters real numbers against it — holding
job-costing hostage to whether the invoice has been formally emailed
yet would make the P&L view lag reality for no real benefit. Called
out explicitly here since it's a real, deliberate divergence from an
existing pattern, not an oversight.

---

## 8. Staged implementation plan

Two stages, per the request, each independently shippable and
verifiable the same way every AP Phase 1 stage was — typecheck, lint,
full test suite, production build, and a live check before moving on.

**(a) Job entity + linking UI + job list page**
Migrations 1–3 (§1.3). `Job` model, `lib/validation/job.ts`, CRUD
routes (`POST`/`GET /api/jobs`, `GET`/`PATCH`/`DELETE
/api/jobs/:id`), the `jobs.*` permission-catalog entries (§6) added to
`STAFF_PERMISSIONS`, sidebar entry (§2), the `/jobs` list page (§3),
`JobPicker` (§5.3) wired into both the Document builder (§5.1) and the
Purchase Invoice builder (§5.2). No P&L aggregation or job detail page
yet — a job can be created and linked to documents/purchase invoices,
and the list page's aggregate columns already work (§3's aggregation
is cheap enough to ship in stage (a) alongside the list page itself,
same as how AP Phase 1 Stage (a)'s Vendor list didn't defer its own
billing-adjacent columns). Verification: create a job, link it from
both builder types, confirm the list page's counts/totals/margin
update correctly, confirm Staff/Admin/Owner tiers behave as the §6
permission set specifies, confirm a job with no links shows zeros (not
an error) and a job's own row stays visible business-wide regardless
of who linked what to it.

**(b) Job detail page — the full P&L view**
No migration. The `/jobs/:id` detail page (§4): header, stat cards,
sales-side table, purchase-side table, Close job/Reopen job action.
Verification: open a job with both sales and purchase invoices linked
across multiple statuses (including at least one cancelled and one
draft on each side), confirm the P&L math matches §7's rules exactly
(cancelled excluded on both sides, draft invoices included, quotations/
proforma visible in the table but excluded from the sum), confirm
Margin % renders "—" correctly for a zero-billed job, confirm Close/
Reopen respects `jobs.edit` and updates the status badge.

Recommended order exactly (a) → (b), same reasoning AP Phase 1's own
§10 gave: (a) is a complete, demoable feature on its own (job tracking
+ linking, without the P&L rollup), and (b) is a pure read-only view
layered on top of data (a) already collects — no reason to build the
detail page before there's any linked data for it to meaningfully
show.

---

## 9. Explicitly out of scope for Phase 2

Naming these so the design doesn't accidentally grow into them
mid-implementation, same discipline AP Phase 1 §9 applied:

- **Multi-currency margin calculation.** If a job's purchase invoices
  are in USD and its sales invoice is in INR (a completely normal
  freight scenario — see AP Phase 1's own dual-currency line-item
  design), `Cost` and `Billed` as defined in §7 are each already in
  their *own* document's settlement currency (`Document.currency` /
  `PurchaseInvoice.currency`, independently). **Naively summing
  `PurchaseInvoice.total` in USD against `Document.total` in INR and
  calling the difference "Margin" would be meaningless** — it would
  add unlike units. What actually happens in Phase 2: **the P&L
  figures are computed and displayed per currency group, not
  collapsed into one number.** If every linked document/purchase
  invoice on a job shares one currency (the common case for a
  single-country job), Billed/Cost/Margin show normally. If a job has
  mixed currencies, the summary shows a separate Billed/Cost/Margin
  line **per currency present**, with no attempt to convert or combine
  them into a single blended figure — same "don't fabricate a
  precision the data doesn't have" instinct as AP Phase 1's own
  per-line `amountInr`/`exRate` fields, which record a conversion
  provenance but never let it silently override the authoritative
  native-currency total. A true single-number cross-currency margin
  (using some conversion rate, applied consistently) is a real,
  separate feature — needs its own design (which rate, as of when,
  whose responsibility to keep current) and is not attempted here.
- **Cost allocation across multiple jobs.** `PurchaseInvoice.jobId`
  and `Document.jobId` are each a single nullable FK — one document or
  purchase invoice belongs to at most one job, full stop. A shared
  vendor bill covering multiple shipments (e.g. one consolidated
  trucking invoice for three jobs) has no way to be split or
  proportionally allocated in Phase 2; it can only be linked to one
  job or left unlinked. Real cost-splitting (by weight, by value, by
  manual percentage) is a materially bigger feature and isn't
  attempted here.
- **Partial invoice assignment.** Relatedly, there's no line-item-level
  job assignment — an entire `Document`/`PurchaseInvoice` links to a
  job, or it doesn't. A single sales invoice billing two different
  jobs' worth of work in one document has no way to be split across
  them in Phase 2.
- **Job-level dates/timeline** (§1.1's own note) — no start/end/
  expected-completion fields; whatever shipment dates matter are read
  off the linked purchase invoice(s)' own `sailedDate`/etc.
- **Auto-linking or inference.** A quotation converted to an invoice
  (`Document.convertedFromQuotationId`, existing feature) does **not**
  automatically carry the quotation's `jobId` to the resulting invoice
  — every link is an explicit user action via the picker (§5), even
  for documents that are otherwise clearly related to each other. This
  keeps the linking model simple and predictable rather than
  special-casing the one existing document-to-document relationship
  that happens to exist; revisit only if real usage shows the manual
  step is genuinely burdensome.
- **Job PDF/export** (§4's own note) — no download, no public link,
  internal-only reporting view.
