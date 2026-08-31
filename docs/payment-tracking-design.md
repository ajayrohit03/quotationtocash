# Real Payment Tracking on Invoices — Design Proposal

Status: **reviewed and approved**, with two decisions folded in below
(overpayment → credit balance; customer-facing visibility). Written
against the live document API, which confirms there is
currently zero data model support for partial payments: no
`amountPaid` field, and while a `Payment` model already exists in
`prisma/schema.prisma` (`id`, `invoiceId`, `amount`, `method`, `paidAt`,
`createdAt`), it has no API and no UI anywhere — it's dead schema.
`"partially_paid"` is a label in `document-search.tsx`'s status filter
and `status-badge.tsx`'s color map with no code path that ever sets it.
`"overdue"` is in the same position: present in `INVOICE_STATUSES`,
queried against in `lib/documents/aggregates.ts`, but **nothing in this
codebase ever writes it** — no cron, no read-time recomputation, no
route. Today, no invoice has ever become overdue no matter how late it
is. That's relevant to §3 below, not just a footnote.

## 1. Data model: separate `Payment` model, plus a maintained `amountPaid` on `Document`

Single `amountPaid` field vs. a `Payment` history: the `Payment` side
wins for the reason the request gives — this is a GST-relevant
financial record, and every other money/compliance decision in this
project (the separate production database, requiring
`requireEditableDocument()`'s draft-only rule rather than extending
editability, the mark-unpaid trace note) has picked auditability over
convenience. A single mutable `amountPaid` field has no memory of *how*
the invoice arrived at that number — three partial payments and one
lump sum are indistinguishable, and there's nowhere to record who
recorded a payment or when. For a financial ledger, that's the wrong
trade.

But it's not *either/or*. The existing `Document.total`,
`subtotal`, `cgst`, etc. are already **frozen, maintained columns**,
not values recomputed live from `LineItem` rows on every read — see the
schema comment on `customerSnapshot`/`businessSnapshot` and
`BuilderDocument.totals`'s comment in `document-builder.tsx` about why
the stored totals are shown as-is rather than re-derived. Payment
tracking should follow the same shape:

- **`Payment`** (extended, not replaced) is the source of truth and the
  audit trail — one row per real transaction. Add two columns the
  existing model is missing for this use: `note String?` (reference/PO
  info, matches the request's `note/reference`) and
  `recordedByUserId String? @map("recorded_by_user_id")`, relation to
  `User` with `onDelete: SetNull`, mirroring `Document.createdByUserId`
  exactly. Add an index on `[invoiceId, paidAt]` — needed for "find the
  most recent payment" in §2.
- **`Document.amountPaid`** (`Decimal @default(0) @db.Decimal(12, 2)`)
  is a maintained running total, updated transactionally in the same
  `prisma.$transaction` as every `Payment` insert/delete. It exists so
  status derivation (§3) and the dashboard aggregates
  (`lib/documents/aggregates.ts`) stay cheap single-column reads
  instead of a `SUM(payments.amount)` join on every list/dashboard
  render — consistent with why `total` itself is stored rather than
  recomputed from line items on every page load.

`remainingBalance` is **not** a stored column — it's always
`document.total - document.amountPaid`, computed wherever it's
displayed. Storing it would just be `amountPaid` restated with a sign
flip and a second place to go stale; there's no case where it needs to
outlive the request that computed it.

## 2. Action/UI redesign

Unifying into a single **"Record payment"** action, per the request's
instinct — this is the right call, not just the simpler one. A single
mechanism means one permission check, one route, one status-derivation
path, and no separate "am I fully or partially paying" branch in the
UI. Concretely:

- **`POST /api/documents/[id]/payments`** — body: `{ amount, paidAt?,
  note? }`. Same permission/scope gate as today's mark-paid:
  `requirePermission("invoices.edit")` + `documentScopeWhere("mutate")`.
  `amount` must be `> 0` — that's the only bound. **Decision (reviewed):
  overpayment is allowed, never capped or truncated.** The full amount
  genuinely received is recorded as entered; if it pushes `amountPaid`
  past `total`, the excess becomes a **credit balance** (§3, §6).
  Rejecting or silently clamping a real payment would mean the ledger
  stops reflecting what actually happened — wrong for the same
  auditability reason `Payment` exists at all.
  Inside a transaction: insert the `Payment` row, increment
  `Document.amountPaid`, recompute `status` per §3, and write it.
- **`POST /api/documents/[id]/payments/reverse-last`** — no body.
  Same permission/scope gate. Finds the most recent `Payment` for this
  document (`orderBy: { paidAt: "desc" }`, tie-broken by `createdAt`),
  deletes it, decrements `amountPaid`, recomputes `status`, and
  prepends a trace note to `Notes` — the same one-time,
  survives-later-edits mechanism shipped tonight for mark-unpaid, reworded:
  `"Payment of ₹{amount} ({paidAt}) reversed by {name} on {today} — recorded via mark-unpaid/reverse-last."`
  Rejects with a clean 4xx if there are no payments to reverse. This
  replaces mark-unpaid's role exactly as proposed — "reverse the most
  recent correction" is the same shape as "undo marking it paid too
  quickly," just generalized to work when there's more than one
  payment in the history.
  Recording a payment does **not** get its own trace note — the
  `Payment` row itself (amount, `paidAt`, `note`, `recordedByUserId`)
  *is* the audit record. The trace note existed for mark-unpaid
  specifically because reverting had no other record; that reasoning
  transfers to reversal here unchanged, but not to the forward action.
- **Old `mark-paid`/`mark-unpaid` routes are removed**, not kept
  alongside the new ones. Leaving both would mean two ways to reach
  `status = "paid"` with different side effects (one leaves an
  `amountPaid` of 0 despite `status = "paid"`), which is exactly the
  inconsistency the request asks not to leave behind.
- **Recording a payment is only allowed once the invoice has been
  sent** — i.e. `status` is not `"draft"` and not `"cancelled"`. This
  is a small tightening versus today's `canMarkPaid()`, which
  technically permits marking a still-draft invoice paid (excludes only
  `"cancelled"`). It didn't come up because nothing in the UI ever
  exercised that path, but "record a real payment against a document
  that was never sent to the customer" isn't a real scenario worth
  keeping open, and closing it removes an edge case from status
  derivation in §3 for free (draft never needs to interact with
  payments at all).

**Document preview page** (`document-preview.tsx`): the "Mark as
paid"/"Mark as unpaid" button pair is replaced with:

- A **"Record payment"** button, visible when `!isQuotation && canEdit
  && status !== "draft" && status !== "cancelled"`. Deliberately not
  gated on `remainingBalance > 0` — since overpayment is now allowed
  (§1 decision), a fully-paid invoice can still legitimately receive
  another payment that becomes credit. Opens a dialog: amount input
  defaulting to the remaining balance (or empty/`0` when already fully
  paid — there's no "remaining" left to default to) but always
  editable, optional date (defaults today), optional note/reference —
  matching the request's instinct exactly.
- A **"Reverse last payment"** action, visible when `canEdit &&
  amountPaid > 0`, styled as a secondary/ghost action (this is a
  correction path, not a primary one) with a confirmation step showing
  which payment — amount and date — is about to be reversed, since
  unlike the old mark-unpaid (which only ever had one payment to
  reverse) this can now be ambiguous to the person clicking it if they
  don't see which one it targets. **Confirmed (per review): the credit
  figure unwinds correctly** — because credit is never stored
  separately (§3 defines it as `max(0, amountPaid - total)`, computed
  fresh from the same `amountPaid` that reversal already decrements),
  reversing a payment that had created a credit balance shrinks or
  zeroes that figure automatically, in the same step, with no separate
  credit-specific reversal logic to keep in sync. If the confirmation
  dialog shows "this payment created a ₹X credit balance," that's worth
  surfacing explicitly in the confirmation copy so the person reversing
  it isn't surprised the credit disappears too.
- A **payment summary + history panel** (§6) sitting between the
  action row and the rendered document, not buried in a sidebar —
  "amount paid / remaining" is the number a real business actually
  scans for, ahead of the status word itself.

## 3. Status computation

A single function, `deriveInvoiceStatus`, called inside the same
transaction as every payment create/reverse — status is **not**
recomputed lazily at read time for `paid`/`partially_paid`/`sent`
(there's no event that would trigger a stale read otherwise; it only
changes in response to a payment mutation, which already has a
transaction open):

```
function deriveInvoiceStatus(currentStatus, total, amountPaid): InvoiceStatus {
  if (currentStatus === "draft" || currentStatus === "cancelled") {
    return currentStatus; // untouched by payments, see §2
  }
  if (amountPaid >= total) return "paid"; // includes the overpaid case — see creditBalance below
  if (amountPaid > 0) return "partially_paid";
  return "sent"; // see below — not "draft"
}

function creditBalance(total, amountPaid): Decimal {
  return max(0, amountPaid - total);
}

function remainingBalance(total, amountPaid): Decimal {
  return max(0, total - amountPaid);
}
```

**Decision (reviewed): overpayment → credit balance, scope explicitly
bounded.** `creditBalance` is not a stored column — like
`remainingBalance`, it's arithmetic derived from the same `total` and
`amountPaid` that already exist, computed wherever displayed (§6). It
is **only** an informational figure: "this customer has paid ₹Z more
than this invoice's total." It is explicitly **not**:

- a new document type,
- a balance that automatically applies against a future invoice for
  the same customer,
- a formal GST credit note.

India's GST law has a real, separate legal concept of credit notes —
a compliance document with its own numbering, reporting, and rules,
issued to formally reduce a supply's value. What's being built here is
a plain tracked-balance number, nothing more. If real credit-note
support is ever needed, it's its own future feature (its own document
type, its own compliance requirements) — this doc's `creditBalance`
must never be silently treated as satisfying that need. Anyone reaching
for this figure to justify skipping a real credit note should treat
that as a bug in how it's being used, not a feature of what it is.

The important departure from tonight's shipped mark-unpaid: reversing
a payment down to `amountPaid === 0` now resolves to **`"sent"`**, not
`"draft"`. Mark-unpaid's revert-to-draft made sense as a single-purpose
action reusing `requireEditableDocument()`'s existing rule, but it was
always a slightly odd side effect — reversing a payment shouldn't
reopen line-item editing on an invoice that already went out and was
subsequently (mistakenly) marked paid. Under the new model that
oddity goes away on its own: `"sent"` is already in
`OUTSTANDING_STATUSES`, is not editable (`isEditableStatus` only
returns true for `"draft"`), and correctly represents "billed,
currently unpaid" without granting content-editing rights the old
behavior incidentally did.

**`"overdue"` stops being a status value that ever gets written.**
Given it's already fully dead code — nothing sets it today, so no
cron/worker needs to be built or replaced — the request's framing
("currently calculated as due date passed and not paid") describes the
intent, not the current reality; there is no calculation happening
anywhere right now. Rather than add a cron job (this app has no
background-job infra at all — no `CRON_SECRET`, no scheduled route)
just to keep a persisted flag in sync with the passage of time, treat
`"overdue"` as a **display-only overlay** computed wherever status is
shown or filtered:

```
function isOverdue(status, dueDate, remainingBalance): boolean {
  return (status === "sent" || status === "partially_paid")
    && dueDate !== null && dueDate < now()
    && remainingBalance > 0;
}
```

- `status-badge.tsx` renders "Overdue" instead of "Sent"/"Partially
  paid" when `isOverdue()` is true, without the underlying `status`
  column ever containing `"overdue"`.
- `document-search.tsx`'s "Overdue" filter becomes a `WHERE` clause
  (`status IN ('sent','partially_paid') AND dueDate < now() AND
  amountPaid < total`) instead of `status = 'overdue'`.
- `lib/documents/aggregates.ts`'s `overdueCount` becomes the same
  computed condition instead of `where: { status: "overdue" }`.

This is a larger call than the request's phrasing implies ("a small
but necessary consequence"), so flagging it plainly: it's a design
change, not a tweak, and it has the side benefit of making "overdue"
actually work for the first time, as a byproduct of the payment model
rather than a separate project. If a persisted, cron-driven `"overdue"`
status is wanted instead (e.g. so it shows up in a stored-status-only
query without the join/date condition), that's a viable alternative,
but it requires standing up scheduled-job infrastructure this app
doesn't have yet, for a feature that isn't part of what was asked for
tonight — recommend deferring that decision rather than bundling it in.

## 4. Backward compatibility: `INV-2026-0001` and any other pre-existing `"paid"` invoice

`INV-2026-0001` is currently `status = "draft"` with `amountPaid`
conceptually `0` — tonight's mark-unpaid already reverted it, and its
`Notes` field already carries the trace note recording that event as
historical fact. **It needs no backfill.** It starts under the new
model exactly where it already is: `amountPaid = 0`, `status =
"draft"`, `Notes` unchanged. Nothing about the migration should touch
it.

For status quo generally: **no live hybrid** — not "pre-existing
documents keep directly-set status forever while new ones derive it."
That would mean two status-computation code paths existing
indefinitely, which is worse than a one-time migration cost. Instead,
a **one-time backfill** brings every existing document under the same
derived model as of the migration:

- For every `Document` where `type = "invoice"` and current `status =
  "paid"` (excluding `INV-2026-0001`, which isn't in that state): insert
  one `Payment` row with `amount = total`, `paidAt = updatedAt`
  (the best available proxy for when it was marked paid — not
  fabricated as "now," and not claimed as more precise than it is),
  `recordedByUserId = null`, and
  `note = "Backfilled at payment-tracking migration — original payment date/recorder unknown; using the invoice's last-updated timestamp."`
  Set `Document.amountPaid = total` to match.
- No `"partially_paid"` documents exist to backfill (the status has
  never been reachable), so no work there.
- After backfill, `status` is left exactly as it was ("paid" stays
  "paid") — the backfill makes the *ledger* consistent with the
  existing status, not the other way around, so no invoice's visible
  state changes as a side effect of this migration.

This is deliberately honest about being an approximation (the note
says so explicitly) rather than presenting a synthesized row as if it
were a real recorded transaction with real provenance — consistent
with treating this as a GST-relevant record where fabricated precision
would be worse than an honest gap.

## 5. Migration plan

Real `prisma migrate dev` migration (following this project's existing
convention — see e.g. tonight's
`20260830131812_add_document_reference_number`), in two parts:

1. **Schema migration**: add `Document.amountPaid` (`default 0`);
   add `Payment.note` and `Payment.recordedByUserId` (+ FK to `User`,
   `onDelete: SetNull`); add index `Payment_invoiceId_paidAt_idx`.
2. **Data migration** (raw SQL step in the same migration file, same
   pattern as `002_rls_policies`/`003_restricted_app_role` being their
   own dedicated migrations in the smile-crm project's history — one
   concern per migration): the backfill `INSERT INTO payments (...)
   SELECT ...` described in §4, followed by `UPDATE documents SET
   amount_paid = total WHERE status = 'paid'`.

No column removal — `"overdue"` remains a valid string in
`INVOICE_STATUSES` (still a legitimate *display/filter* value per §3),
it just stops being written to the `status` column by application code
going forward. Existing rows can't have `status = 'overdue'` today
anyway (nothing ever set it), so there's no cleanup needed there
either.

## 6. UI: payment history — in-app, public share, and PDF

**Decision (reviewed): payment history and the credit balance are
customer-facing**, not in-app only — reversing the recommendation in
the original draft. Rendered through `DocumentRender`
(`document-render.tsx`), the single component already confirmed
tonight (during the reference-number work) to be the one place feeding
the in-app preview, the PDF (`lib/pdf/document-pdf.tsx`), and the
public share page (`app/public/documents/[token]/page.tsx`) — the same
reuse rationale that change established applies directly here, not as
a one-off addition per surface.

Between the action row and the rendered document in-app
(`document-preview.tsx`), and inside the REFERENCE-adjacent area of
`DocumentRender` itself for the PDF/public-share/in-app rendering, a
panel:

```
Amount paid: ₹42,000 of ₹60,000 — ₹18,000 remaining
┌─────────────────────────────────────────────┐
│ ₹25,000   12 Aug 2026   "Advance"   — Priya  │
│ ₹17,000   20 Aug 2026   —           — Priya  │
└─────────────────────────────────────────────┘
Record payment          Reverse last payment
```

or, when `creditBalance > 0`:

```
Amount paid: ₹65,000 of ₹60,000 — Credit balance: ₹5,000
```

- Summary line always shown once the invoice has been sent (not for
  drafts, which have no payment activity by construction per §2).
  Shows "Fully paid" instead of an amount when `remainingBalance ===
  0` and `creditBalance === 0`; shows the credit-balance line instead
  when `creditBalance > 0`. The credit figure is captioned plainly as
  a tracked balance ("Credit balance: ₹Z"), never worded in a way that
  could be mistaken for a GST credit note (§3's boundary).
- History list: one row per `Payment`, newest first — amount, date,
  and note (if any) on **every** surface. The recorder's name
  (`recordedByUserId` resolved to `User.name`) is shown **in-app only**
  — this wasn't asked for explicitly, but disclosing which internal
  staff member handled a transaction to the customer viewing their own
  public share link/PDF is a separate privacy call the request didn't
  make, so it's excluded from the customer-facing surfaces by default
  rather than assumed included; the in-app panel keeps it (staff
  looking at their own record of who did what). Backfilled §4 rows
  show "—" for the recorder in-app, same as before.
  Read-only everywhere: no per-row edit/delete in this iteration —
  "reverse last" (in-app only; not exposed to the customer) is the only
  correction mechanism, matching the scope the request asks for.
  Editing or deleting an arbitrary historical payment is a reasonable
  future extension, deliberately excluded now the same way the
  original `Payment` model shipped with no API before this doc.
- `payments`, `amountPaid`, `remainingBalance`, and `creditBalance`
  flow through `lib/documents/present.ts` (`toPreviewDocument`) and
  `PreviewDocument` (`preview-types.ts`) — the single conversion point
  — so all three consuming surfaces (`document-preview.tsx`,
  `lib/pdf/document-pdf.tsx`, `app/public/documents/[token]/page.tsx`)
  read the same computed numbers rather than three separate
  recomputations that could drift.

## Open questions for review

1. `"overdue"` as a computed overlay (§3) vs. building real scheduled-job
   infrastructure to persist it — proposed computed overlay; flagging
   because it's the one place this doc goes beyond "just add payment
   tracking" into changing how an existing (if currently broken) status
   works.

Resolved by review: overpayment → credit balance (bounded explicitly
in §3), and payment history/credit balance are customer-facing on the
public share view and PDF, with the recorder's name kept in-app only
(§6).
