# Custom Fields + Per-Line Multi-Currency — Design Proposal

Status: **proposal, not implemented**. Driven by a real client's
freight-invoice use case (reference PDF reviewed), but scoped
explicitly as two **generic** capabilities — no freight-specific
schema, so any industry's document (a caterer's per-item weight, a
consultant's PO reference, a manufacturer's batch number) can use the
same mechanism without a migration.

## 0. Two capabilities, one document, deliberately independent

Custom fields and multi-currency line pricing happen to appear
together on the reference invoice, but nothing below couples them —
either could ship without the other, and §6 sequences them separately
for exactly that reason. They only share one thing: both render
through the surfaces already unified during tonight's earlier work
(reference-number, payment tracking, payment details) —
`document-render.tsx` (in-app preview + public share),
`lib/pdf/document-pdf.tsx` (PDF), and `document-builder.tsx` /
`line-items-editor.tsx` (the editable side). That reuse is called out
explicitly in §4 because it's the main reason this is buildable at
all without four divergent implementations.

## 1. Data model

### 1a. Custom fields — confirming the JSON hypothesis, with one correction

The starting hypothesis was right about **where values live**, but the
reasoning needs sharpening, because `businessSnapshot`/`customerSnapshot`
aren't quite the right precedent for the reason originally given.

**Why the snapshot analogy doesn't directly apply**: `businessSnapshot`/
`customerSnapshot` exist to freeze a *copy of another row's live data*
at document-creation time (the business's address can change; the
invoice must keep showing what it said when sent). Custom field
*values* aren't copies of anything — they're primary data entered
directly on this document, with no live source being snapshotted.
That's a genuine difference, and "we already use JSON for flexible
shapes elsewhere" isn't by itself a reason to store editable primary
data the same way a frozen copy is stored.

**Where the snapshot pattern genuinely does apply**: the field
*definitions* (label, type, display order) are exactly the kind of
external, independently-editable state that needs freezing. If
`CustomFieldDefinition.label` is renamed six months from now, or the
definition is archived, every historical document referencing it by
id alone would need a live join back to a row that may have changed
or vanished — silently renaming/breaking old invoices, which is
precisely the failure mode the snapshot pattern exists to prevent
elsewhere in this app.

**Recommendation**: a real `CustomFieldDefinition` model (the
structural/management side — CRUD needs real rows to edit, list,
reorder), plus a JSON array on `Document` and on `LineItem` that
snapshots **both the value and the definition metadata as of save
time**, not just `{ [definitionId]: value }`:

```ts
// Document.customFieldValues / LineItem.customFieldValues — Json
type CustomFieldValueSnapshot = {
  definitionId: string; // for edit-in-place while still a draft
  label: string;        // frozen — a later rename never touches this document
  type: "text" | "number" | "date";
  value: string | number | null;
  sortOrder: number;    // frozen display order at save time
};
```

```prisma
model CustomFieldDefinition {
  id         String       @id @default(uuid())
  businessId String       @map("business_id")
  label      String
  type       CustomFieldType   // text | number | date — see below
  scope      CustomFieldScope  // document | lineItem
  appliesTo  DocumentType?     // null = both quotation and invoice
  sortOrder  Int          @default(0) @map("sort_order")
  isActive   Boolean      @default(true) @map("is_active") // soft-delete,
  // same pattern as BusinessMember.isActive — archiving must not corrupt
  // historical documents that already snapshotted this definition's
  // label/type (see above), so hard delete is never needed or used.

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@index([businessId, scope])
  @@map("custom_field_definitions")
}
```

Type is deliberately a small fixed set — `text | number | date` — not
a generic type system (no select/dropdown/boolean/formula in v1). That
covers every field the reference invoice needs (Container No. = text,
Gross Weight = number, ETD/ETA = date) without building an editor for
field types nobody's asked for yet. Flagging this as an explicit scope
boundary so it's a deliberate choice, not an oversight.

**Explicit trade-off, stated rather than glossed over**: JSON values
mean this app cannot efficiently filter/report by custom field value
("show me every invoice where Container No. = X") without a JSONB
`@>`/GIN-index approach later, or breaking searchable fields out into
real columns. Given the stated use case — these are *printed* fields,
not reporting dimensions — that's the right trade for now. If a real
"filter invoices by custom field" need shows up later, that's a
genuinely different, larger feature (closer to a saved-search/reporting
system) and should be scoped separately rather than retrofitted here.

### 1b. Multi-currency — confirming the input-helper hypothesis

Read `lib/tax/calculateDocumentTotals.ts` and `lib/tax/calculateGST.ts`
directly (not from memory) to check this: both consume only
`LineItem.rate`, `qty`, `discountPct`, `gstRate` — **nothing about
currency conversion exists anywhere in the tax/totals engine today**,
and neither function has any notion of "foreign" vs "document"
currency. That confirms the hypothesis cleanly: there is no
calculation-engine coupling to unwind, because there isn't one to begin
with. Treating foreign-currency + exchange-rate as a pure *input
helper* that computes `rate` once, at entry time, is not just
lower-risk than teaching the engine about multiple currencies — it's
the only change that touches zero lines of tax logic.

Schema addition — `LineItem` only, `Document.currency` is untouched
and remains the single settlement currency for the whole document:

```prisma
model LineItem {
  // ...existing fields unchanged...
  foreignCurrency String?  @map("foreign_currency")            // e.g. "USD"
  foreignRate     Decimal? @map("foreign_rate") @db.Decimal(12, 2)
  exchangeRate    Decimal? @map("exchange_rate") @db.Decimal(12, 6)
  // rate (existing column, Decimal(12,2), in Document.currency) is what
  // calculateDocumentTotals/calculateGST already read — unchanged.
}
```

`exchangeRate` gets more decimal precision (6 vs. `rate`'s 2) because
real INR exchange rates commonly need 4-6 significant digits
(₹83.24671/USD) where `rate` itself is a rounded money value.
`foreignCurrency`/`foreignRate`/`exchangeRate` are pure provenance —
display and re-editing context — never read by any calculation
function. Deleting them wouldn't change a single total.

**No FX-rate lookup integration.** Exchange rate is manually typed by
whoever is billing, exactly as the reference invoice shows it done —
no live rate API, no business-level "supported currencies" list.
Flagging this explicitly as an out-of-scope boundary, not an
oversight: it's a real, separate feature (rate-fetching, staleness,
which provider) if ever needed.

## 2. Frozen-at-input, precisely

The request asks this to be stated explicitly rather than left
implicit — here it is:

- **Editing `foreignRate` or `exchangeRate` themselves** recomputes
  `rate = round(foreignRate × exchangeRate, 2)` once, synchronously, in
  the same builder interaction — the same "compute once when entered or
  edited" behavior the request describes. This is the *only* trigger.
- **Editing anything else on the line** (qty, discountPct, gstRate) or
  anything else on the document **never** re-triggers a currency
  conversion. `rate` is, from that point, an ordinary editable Decimal
  field like it always was — `calculateDocumentTotals` doesn't know or
  care that it originated from a currency conversion.
- **There is no background/scheduled re-conversion of any kind** — no
  cron re-pricing a line because "the rate changed since." Once
  written, `rate` only ever changes through a direct edit (to `rate`
  itself, or to `foreignRate`/`exchangeRate` triggering the one-time
  recompute above).
- **This is naturally bounded by `isEditableStatus`**, the same rule
  already governing every other line-item edit: once a document leaves
  `draft`, the whole document — currency fields included — is frozen by
  the existing `requireEditableDocument()` gate. No new enforcement
  needed; multi-currency inherits it for free.

Net effect: a line's `rate` is exactly as "frozen at save time" as
every other already-computed value in this app (totals, snapshots) —
it just has two different ways to arrive at a value (typed directly,
or derived once from foreign inputs), and once arrived at, both are
indistinguishable to everything downstream.

## 3. Settings UI for custom field definitions

New tab in `app/(app)/settings/settings-tabs.tsx`, following the exact
shape of the existing tabs (`payment-tab.tsx` is the most recent,
closest template) — "Custom fields," with two sections (Document
fields / Line item fields), each a table: Label, Type, Applies to
(Quotations / Invoices / Both), an active toggle, and reorder controls.

- **Add/Edit**: a dialog mirroring `edit-product-dialog.tsx`'s
  established shape (react-hook-form + Zod, `values`-based prefill for
  edit). Fields: label (text), type (select: text/number/date), scope
  (document/line item — fixed at creation, not editable after, since
  changing scope on a definition that already has historical value
  snapshots referencing it as one scope would be incoherent), applies
  to (select).
- **Delete → archive**: sets `isActive: false`, never a hard delete —
  per §1a, historical documents already snapshotted everything they
  need from this definition, so archiving is safe at any time and
  simply stops it from being offered on new documents.
- **Reorder**: simple up/down controls adjusting `sortOrder`, not
  drag-and-drop — this codebase has no drag-and-drop dependency
  anywhere in `package.json`, and adding one is a real dependency
  decision that shouldn't happen as a side effect of this feature.

## 4. Rendering plan across all four surfaces

**Document-level fields** — the smaller half of this work. One new
section in `document-builder.tsx`, positioned near the existing
Reference/Validity block, rendering one input per active
document-scope definition (filtered to the document's own type via
`appliesTo`). Values live in the builder's existing local-state +
autosave pattern, included in the `PATCH` body as
`customFieldValues: CustomFieldValueSnapshot[]`, written verbatim
(snapshotting label/type/sortOrder as they are *right now*, per §1a).
On the read side, they flow through `toPreviewDocument` into
`PreviewDocument.customFieldValues`, and render inside
`document-render.tsx`'s existing REFERENCE block as additional
one-per-line rows — **reusing the exact `{label}: {value}` list
pattern already built for the Payment Details bank-fields block**
(`bankLines.map(...)` in `document-render.tsx`), not a new layout
primitive. Since `DocumentRender` already feeds the in-app preview, the
PDF (`document-pdf.tsx` mirrors the same rows in its own `<Text>`
layout), and the public share page, this is one rendering decision
applied at the one shared point plus its PDF twin — genuinely
contained.

**Line-item fields** — sized honestly as the largest single piece of
UI work in this whole effort, because it hits a **dynamically-columned
table in four separate places**, and none of them share an
implementation:

1. `line-items-editor.tsx` — the builder's real `<Table>` (currently
   fixed columns: description/qty/rate/discount/GST/amount). Adding N
   active line-item-scope definitions means N additional editable
   columns, computed per-render from `appliesTo` + the document's type,
   with all the width/overflow/tab-order consequences of a table whose
   column count isn't fixed at build time.
2. `document-render.tsx`'s line-items block — **not** a `<table>`, a
   hand-built flex row (`<div className="flex ...">` per line, fixed
   `w-16`/`w-24`/`w-28` column widths). Adding dynamic columns here
   means the whole row's flex layout has to accommodate a variable
   number of extra cells, for both the in-app preview and the public
   share page (same component, per §0).
3. `document-pdf.tsx` — a **third**, independent layout system
   (`react-pdf`'s own `<View>`/`<Text>` primitives, no CSS flexbox,
   nothing shared with the web renderer's styles). The column set has
   to be kept in sync with (2) by hand — there's no shared column
   definition today, so this design should introduce one (a single
   `resolveLineItemColumns(document)` helper both renderers call) rather
   than let three implementations drift independently.
4. **Multi-currency's rendering, by contrast, is small**: no new
   column anywhere. When `foreignCurrency` is set, the existing Rate
   cell in all three of the above gets one extra sub-line ("USD 500 @
   83.24671"), the same "optional second line inside an existing cell"
   shape already used for line-item descriptions. Calling this out
   specifically because it's easy to conflate with the custom-fields
   column work when scoping — it isn't the same size of problem.

## 5. Tax-summary multi-rate finding — verified, not assumed

Read `lib/tax/calculateDocumentTotals.ts` and `calculateGST.ts`
directly. Finding:

- **Per-line calculation is already correct for mixed rates.**
  `calculateDocumentTotals` calls `calculateGST(lineAmount, item.gstRate,
  sameState)` once per line item, inside the loop, and accumulates the
  result into running `cgst`/`sgst`/`igst` totals. A document with both
  a 2.5% line and a 9% line computes each line's tax independently and
  sums correctly — the **grand total is accurate today**, for any mix
  of rates.
- **The display is where the gap is.** `document-render.tsx`'s totals
  block (and `document-pdf.tsx`'s mirror) render exactly one blended
  `CGST`/`SGST`/`IGST` row each, from `document.cgst`/`sgst`/`igst` —
  the single aggregate columns. There is no per-rate breakdown anywhere
  today. A real GST invoice with mixed rates conventionally shows
  "CGST @2.5%: ₹X" and "CGST @9%: ₹Y" as separate lines (which the
  reference invoice does) — this app currently cannot show that,
  regardless of custom fields or multi-currency.

**Fix, in scope for this effort since it blocks the reference
use case directly**: a new pure function, e.g.
`groupTaxByRate(lineItems, sameState): { rate: number; taxableAmount:
Decimal; cgst: Decimal; sgst: Decimal; igst: Decimal }[]` in `lib/tax/`,
grouping already-frozen `LineItem` rows by `gstRate` and applying the
existing `calculateGST` per bucket **at render time**. This is safe in
exactly the way re-deriving `item.gstRate` display already is — it
re-presents already-frozen line data, it does not recompute business
logic against anything live. `Document.cgst`/`sgst`/`igst` stay
untouched as the accounting source of truth (no new persisted column);
the grouped breakdown is computed fresh from `lineItems` wherever it's
shown, the same "cheap to recompute from frozen inputs, so don't
persist it separately" reasoning already applied to per-line GST%
display. Both `document-render.tsx` and `document-pdf.tsx` swap their
single CGST/SGST/IGST rows for one row per active rate bucket — a
document with only one rate in use (the overwhelmingly common case)
renders identically to today, one bucket.

## 6. Staged implementation plan

The request's suggested order (document-level fields + Settings first,
then line-item fields, then multi-currency) is sound for the first
step, but §4 changes the ordering for the rest: multi-currency (small,
isolated to `LineItemsEditor` + two render points, no new columns) is
lower-risk than line-item custom fields (the dynamic-column problem
across four implementations) — doing the smaller risky thing before
the bigger one gives more verified ground to stand on before the
largest stage. Proposed order, each independently verifiable:

1. **`CustomFieldDefinition` + Settings CRUD UI.** Data model,
   migration, and the full Settings tab (add/edit/archive/reorder). No
   document/PDF rendering changes yet — verify definitions can be
   created, edited, archived, and reordered, full stop.
2. **Document-level custom field values.** Builder input section +
   `PATCH` validation + the REFERENCE-block rendering across
   preview/PDF/public-share (§4's smaller half). Verify end-to-end on
   one real document type field before touching line items.
3. **Tax-summary multi-rate grouping fix.** Self-contained, no
   dependency on stages 1-2 or on multi-currency — a real invoice with
   two GST rates today, verified to show two rate-wise rows after.
   Sequenced here as a confidence-building, isolated bug-fix-shaped
   change between two larger UI stages.
4. **Multi-currency line-item input helper.** Schema fields, the
   freeze mechanism (§2), and the Rate-cell sub-line rendering across
   all three renderers. Isolated to `LineItemsEditor` and the two
   line-item row renderers — doesn't touch the tax engine at all (§1b).
5. **Line-item-scope custom fields.** Last, deliberately — the
   dynamic-column problem across `line-items-editor.tsx`,
   `document-render.tsx`, and `document-pdf.tsx` (§4) is the largest
   and riskiest single piece of this entire effort, and benefits most
   from stages 1-4 already being stable and independently verified
   underneath it.
