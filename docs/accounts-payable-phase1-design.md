# Accounts Payable — Phase 1 Design Proposal

Status: **draft, for review**. Vendors, purchase invoices, and payment
tracking (mark paid/partial). No reconciliation against sales
invoices, no job-based P&L, no vendor statements, no GST input credit
tracking — see §9. Written against the live schema/code as of this
commit; every claim below about "the existing X" was confirmed by
reading `prisma/schema.prisma`, `lib/auth/permissions.ts`,
`lib/documents/status.ts`, `lib/documents/visibility.ts`,
`lib/documents/snapshots.ts`, `lib/documents/payment-details.ts`,
`lib/documents/business-identity.ts`, `lib/documents/numbering.ts`,
`components/layout/sidebar-nav.tsx`, and
`app/(app)/settings/settings-tabs.tsx`, not assumed.

**Update:** the actual reference PDF (Pacific Ocean Logistics →
EMAJ Freight, a two-page "Draft Invoice" for sea freight export FCL)
was located and opened after the first draft of this doc was written
against the request's field-level description alone. It confirmed most
of that description but surfaced real gaps, corrected below in place —
search this doc for "**Corrected after seeing the real PDF:**" for
every point that changed. The single largest one: the shipment-details
block has roughly twice as many fields as originally described (§1.4).
Page 2 of the reference PDF is a full duplicate of page 1 with only the
Bank Details table filled in — an artifact of Pacific Ocean's own PDF
generator overflowing that one section, not a layout this app's
renderer needs to reproduce (§6 already proposed fitting everything on
one page, which stands).

---

## 0. The one framing decision everything else follows from

A Purchase Invoice is not a Document with the roles reversed. Four
concrete differences make that clear:

1. **The issuer is external and untrusted-format.** Every `Document`
   today is authored by *this* business, in *this* app, so its shape is
   whatever the builder produces. A purchase invoice's shape is
   whatever Pacific Ocean Logistics's invoicing software produced — SAC
   codes rather than HSN-only, an FC/INR dual-currency column pair on
   every line, a tax-summary-by-rate table, "total in words." Trying to
   fit that into `LineItem`/`Document` would mean bolting freight-only
   columns onto the one model every quotation and sales invoice also
   uses.
2. **The counterparty relationship is inverted.** `Document.customerId`
   points at who we bill; a purchase invoice's counterparty is who
   billed *us*. Reusing `Customer` for that would mean either a
   confusing dual-purpose model or a `Customer.isVendor` flag that
   contaminates every customer-list query with a filter it never needed
   before.
3. **There's no send/share step.** Every `Document` route this app has
   (`send`, `share`, the public token view) exists because *we* dispatch
   the document to someone external. A purchase invoice already arrived
   by email/post from the vendor — Phase 1 has nothing to send. That
   alone removes a meaningful slice of the `Document` API surface from
   ever needing an equivalent.
4. **The money direction is reversed**, which is a real permissions
   question (§8), not just semantics.

Recommendation: **`Vendor` and `PurchaseInvoice` are new, standalone
models** — not extensions of `Customer`/`Document`, not a shared table
with a type discriminator. Full reasoning for each in §1. The payoff:
every `Record<DocumentType, X>` exhaustiveness pattern already in this
codebase (`EDIT_PERMISSION`, `STATUSES_BY_TYPE`,
`MANUALLY_SETTABLE_STATUSES`, the PDF/email routes, `COPY` in
`document-list-page.tsx`, etc.) stays untouched — AP is additive, not
a fifth case threaded through code that was never written expecting a
reversed-direction document.

---

## 1. Data model

### 1.1 `Vendor` — separate model, not `Customer` reuse

```prisma
model Vendor {
  id         String @id @default(uuid())
  businessId String @map("business_id")

  name    String
  email   String?
  phone   String?
  address String?
  city    String?
  state   String?
  gstin   String?

  // Same tier/shape as Business's own identity fields
  // (schema.prisma's Business.pan/tan/cin/swiftCode) — a vendor invoice
  // may show any of these, and Phase 1's PDF (§6) reproduces them
  // verbatim, so the same fields belong here for the same reason they
  // belong on Business.
  pan String?
  cin String?

  // Bank details of the VENDOR — this is who Accounts Payable owes
  // money to, not who we collect from, so this is the "PAYMENT
  // DETAILS"/"Bank Details" side on a purchase invoice PDF (§6), same
  // shape as Business.bankName/accountHolderName/accountNumber/
  // ifscCode/upiId. **Corrected after seeing the real PDF:** its Bank
  // Details table also has its own Swift Code line (distinct from the
  // vendor's own GST-registration identity, which has none) — added
  // here; Business already has this field for the identical reason.
  // "RTGS/NEFT" on the reference PDF is this vendor's own label for
  // what every other bank-details block in this app already calls
  // IFSC — same field, not a new one.
  bankName          String?
  accountHolderName String? @map("account_holder_name")
  accountNumber     String? @map("account_number")
  ifscCode          String? @map("ifsc_code")
  upiId             String? @map("upi_id")
  swiftCode         String? @map("swift_code")

  isActive Boolean @default(true) @map("is_active")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  business         Business          @relation(fields: [businessId], references: [id], onDelete: Cascade)
  purchaseInvoices PurchaseInvoice[]

  @@index([businessId])
  @@map("vendors")
}
```

Why not reuse `Customer`: structurally the two would diverge the
moment you add vendor bank details (a customer never needs a bank
account on file) and `pan`/`cin` (a customer record has never needed
these — only `Business`, the paying/receiving entity, does). A shared
table would mean either nullable columns that are meaningless for one
side (a `Customer` row with `accountNumber` set makes no sense — we
never pay a customer), or a `role`/`isVendor` discriminator that every
existing customer query (`app/(app)/customers/page.tsx`,
`getCustomersBillingSummaries`, `customer-picker.tsx`) would need to
filter on defensively forever, for a feature that doesn't concern it.
`isActive` mirrors `BusinessMember.isActive`/
`CustomFieldDefinition.isActive` — soft-delete, since a
`PurchaseInvoice.vendorId` FK means a vendor can't be hard-deleted once
it has invoices anyway (same `onDelete: Restrict` reasoning as
`Document.customerId`, applied below).

### 1.2 `PurchaseInvoice` — separate model, not `Document` reuse

```prisma
enum PurchaseInvoiceStatus {
  received
  approved
  partially_paid
  paid
  cancelled

  @@map("purchase_invoice_status")
}

model PurchaseInvoice {
  id         String @id @default(uuid())
  businessId String @map("business_id")
  vendorId   String @map("vendor_id")

  // The vendor's OWN invoice number (e.g. Pacific Ocean Logistics's own
  // "POL/2026/0142") — never generated by us, always typed in at entry
  // time (§5). Deliberately NOT unique per business: two different
  // vendors could coincidentally use the same numbering scheme, and
  // even the same vendor might issue a genuine duplicate-numbered
  // credit/corrected invoice in the real world; nothing here should
  // silently reject that. Our own internal reference is `id` /a
  // separate display counter if reporting ever needs one — not in
  // scope for Phase 1 (§9).
  vendorInvoiceNumber String  @map("vendor_invoice_number")
  vendorInvoiceDate   DateTime @map("vendor_invoice_date")
  dueDate             DateTime? @map("due_date")

  status PurchaseInvoiceStatus @default(received)

  subtotal      Decimal @default(0) @db.Decimal(12, 2)
  taxableAmount Decimal @default(0) @map("taxable_amount") @db.Decimal(12, 2)
  cgst          Decimal @default(0) @db.Decimal(12, 2)
  sgst          Decimal @default(0) @db.Decimal(12, 2)
  igst          Decimal @default(0) @db.Decimal(12, 2)
  // **Corrected after seeing the real PDF:** its tax-summary table has
  // its own CESS column (always 0.00 on this vendor's invoices — GST
  // cess doesn't apply to freight/logistics services — but it's a real
  // printed column, so a faithful PDF needs somewhere to read a value
  // from, even if that value is always 0 for Phase 1's own entry form).
  cess          Decimal @default(0) @db.Decimal(12, 2)
  total         Decimal @default(0) @db.Decimal(12, 2)
  currency      String  @default("INR")

  // **Corrected after seeing the real PDF:** it has its own "Rounded:
  // 0.00" / "Net Total:" line, the exact AP equivalent of sales
  // documents' "Round total" feature — reuse lib/tax/applyRounding.ts
  // directly (the math is a pure function of a raw total, already
  // direction-agnostic) rather than re-deriving it.
  roundTotal         Boolean @default(false) @map("round_total")
  roundingAdjustment Decimal @default(0) @map("rounding_adjustment") @db.Decimal(12, 2)

  // Only meaningful when currency !== "INR" — same FC/INR dual-column
  // shape LineItem already has (foreignRate/exchangeRate), needed here
  // because the reference PDF prices in a foreign currency with an
  // INR-converted column on every line (§6), not just an optional
  // display sub-line the way sales invoices' showInrEquivalent is.
  exchangeRate Decimal? @map("exchange_rate") @db.Decimal(12, 6)

  // Maintained running total, same pattern as Document.amountPaid —
  // see §7.
  amountPaid Decimal @default(0) @map("amount_paid") @db.Decimal(12, 2)

  // Shipment/freight details — see §1.4 for why these are typed
  // columns here rather than routed through the existing
  // CustomFieldDefinition system, and for the full field inventory
  // (this list roughly doubled once the real PDF was seen — the
  // original description undercounted it).
  shipmentMode     String? @map("shipment_mode")
  vesselVoyage     String? @map("vessel_voyage")
  sailedDate       DateTime? @map("sailed_date")
  portOfLoading    String? @map("port_of_loading")
  portOfDischarge  String? @map("port_of_discharge")
  originPort       String? @map("origin_port")
  placeOfDelivery  String? @map("place_of_delivery")
  shipper          String?
  ciReference      String? @map("ci_reference")
  salesPerson      String? @map("sales_person")
  containerNo      String? @map("container_no")
  jobRef           String? @map("job_ref")
  customerRef      String? @map("customer_ref")
  packageType      String? @map("package_type")
  noOfPackages     Decimal? @map("no_of_packages") @db.Decimal(12, 2)
  hbl              String?
  mbl              String?
  weightKg         Decimal? @map("weight_kg") @db.Decimal(12, 2)
  chargeableWeight Decimal? @map("chargeable_weight") @db.Decimal(12, 2)
  volumeCbm        Decimal? @map("volume_cbm") @db.Decimal(12, 2)
  customsDocRef    String? @map("customs_doc_ref")
  termsOfShipment  String? @map("terms_of_shipment")

  notes String?

  // Frozen at save time — same non-negotiable rule as
  // Document.customerSnapshot/businessSnapshot (schema.prisma's own
  // comment on those, and lib/documents/snapshots.ts): a vendor's GSTIN
  // correction or bank-detail change next month must never rewrite an
  // invoice we already recorded and possibly already paid against.
  // vendorSnapshot is the new counterpart to customerSnapshot;
  // businessSnapshot here is OUR OWN business's identity (the "Bill
  // To" block on the reference PDF) frozen the same way sales
  // documents freeze it — reuses the *same* BusinessSnapshot type from
  // lib/documents/snapshots.ts, since it's the identical set of fields.
  vendorSnapshot   Json @map("vendor_snapshot")
  businessSnapshot Json @map("business_snapshot")

  createdByUserId String? @map("created_by_user_id")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  business        Business             @relation(fields: [businessId], references: [id], onDelete: Cascade)
  vendor          Vendor               @relation(fields: [vendorId], references: [id], onDelete: Restrict)
  createdBy       User?                @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)
  lineItems       PurchaseLineItem[]
  payments        VendorPayment[]

  @@index([businessId])
  @@index([businessId, status])
  @@index([businessId, vendorId])
  @@index([businessId, createdAt])
  @@map("purchase_invoices")
}
```

### 1.3 `PurchaseLineItem`

```prisma
model PurchaseLineItem {
  id                String  @id @default(uuid())
  purchaseInvoiceId String  @map("purchase_invoice_id")

  description String
  // SAC (Services Accounting Code) — the reference PDF's line items
  // are services (freight/logistics), so this is SAC-only, not the
  // HSN-or-SAC ambiguity lib/einvoice/buildIrpPayload.ts's
  // lookupHsnCode() already has to guess at for sales documents. A
  // real typed column here, not a custom field, precisely because
  // it's always present and always this one meaning for this document
  // type — unlike sales LineItems, which cover physical goods and
  // services alike.
  sac         String?

  qty  Decimal @db.Decimal(12, 2)
  unit String? // UOM — "Kg", "CBM", "Shipment", etc., free text

  rate   Decimal @db.Decimal(12, 2) // in PurchaseInvoice.currency
  amount Decimal @db.Decimal(12, 2) // qty * rate, in PurchaseInvoice.currency

  // Only meaningful when PurchaseInvoice.currency !== "INR" — the
  // reference PDF shows "Invoice Amount (FC)" and "Invoice Amount
  // (INR)" as two separate columns on every line, not a document-level
  // subtotal conversion the way sales documents' showInrEquivalent
  // works. amountInr = round(amount * PurchaseInvoice.exchangeRate, 2),
  // computed once at entry time, same "derive once, then it's just an
  // editable-looking display field" rule as LineItem.rate when
  // foreignCurrency is set (schema.prisma's own comment there).
  amountInr Decimal? @map("amount_inr") @db.Decimal(12, 2)

  taxableAmount Decimal @map("taxable_amount") @db.Decimal(12, 2)
  gstRate       Decimal? @map("gst_rate") @db.Decimal(5, 2)
  cgst          Decimal @default(0) @db.Decimal(12, 2)
  sgst          Decimal @default(0) @db.Decimal(12, 2)
  igst          Decimal @default(0) @db.Decimal(12, 2)
  // Always 0 in practice for freight/logistics services (see §1.2's
  // PurchaseInvoice.cess comment) but a real per-line column on the
  // reference PDF's own table, so it's here too rather than only
  // totalled at the invoice level with no per-line source.
  cess          Decimal @default(0) @db.Decimal(12, 2)

  sortOrder Int @default(0) @map("sort_order")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  purchaseInvoice PurchaseInvoice @relation(fields: [purchaseInvoiceId], references: [id], onDelete: Cascade)

  @@index([purchaseInvoiceId])
  @@map("purchase_line_items")
}
```

No `productId` — the existing `Product` catalog is priced/GST-rated
for what *we sell*; a vendor's freight service line has no meaningful
relationship to it. Reusing `Product` here would be the same category
error as reusing `Customer` for `Vendor`.

### 1.4 Shipment/freight fields: typed columns, not `CustomFieldDefinition`

The existing custom-fields system
(`lib/validation/custom-fields.ts`'s `appliesTo:
z.enum(["quotation", "invoice"])`, `CustomFieldScope` of
`document`/`lineItem`) is built and wired specifically for the three
existing `DocumentType`s — every appliesTo check, the Settings UI
(`custom-fields-tab.tsx`), and the snapshot shape
(`CustomFieldValueSnapshot`) all assume one of those three. Extending
it to a fourth "document family" means widening `appliesTo` to a type
that includes `"purchase"` and auditing every switch/`Record` keyed on
the current three-member set for a silent gap.

That cost buys open-ended user-defined fields — which this document
type doesn't need. The reference PDF's shipment block is a fixed,
known set that does not vary per business the way a business's own
custom fields do. **Corrected after seeing the real PDF:** the set is
roughly twice the size the request's own description suggested — the
full inventory, label as printed → field:

| Printed label | Field | Type |
|---|---|---|
| Shipment Details For (the block's own heading, e.g. "SEA FREIGHT EXPORT FCL") | `shipmentMode` | `String?` |
| Vessel/Voyage | `vesselVoyage` | `String?` |
| Sailed Date | `sailedDate` | `DateTime?` |
| Port of Loading | `portOfLoading` | `String?` |
| Port of Discharge | `portOfDischarge` | `String?` |
| Origin Port | `originPort` | `String?` |
| Place of Delivery | `placeOfDelivery` | `String?` |
| Shipper | `shipper` | `String?` |
| CI Reference | `ciReference` | `String?` |
| Sales Person | `salesPerson` | `String?` |
| Container No. | `containerNo` | `String?` |
| Job Ref | `jobRef` | `String?` |
| Customer Ref | `customerRef` | `String?` |
| Package Type | `packageType` | `String?` |
| No. of Packages | `noOfPackages` | `Decimal?` |
| HBL | `hbl` | `String?` |
| MBL | `mbl` | `String?` |
| Weight(KGS) | `weightKg` | `Decimal?` |
| Chargeable Weight | `chargeableWeight` | `Decimal?` |
| Volume(CBM) | `volumeCbm` | `Decimal?` |
| Customs Doc Ref | `customsDocRef` | `String?` |
| Terms of Shipment | `termsOfShipment` | `String?` |

Weight/volume/package-count are typed `Decimal`, not `String` — the
original description assumed freeform strings like "24,500 KGS" or
"1x40HC," but the real PDF prints these as plain numbers with the unit
fixed in the *label itself* ("Weight(KGS)", "Volume(CBM)"), so a real
numeric column is both correct and more useful (sortable/aggregable
later) with zero added parsing complexity. Everything else stays
`String?`, freeform, exactly as printed — Sailed Date is the one
`DateTime?` alongside it (it's a real date on the reference PDF, blank
in this particular draft example).

**Recommendation stands: real typed columns on `PurchaseInvoice`**
(§1.2 now reflects the corrected list), all optional. If a future
phase needs businesses to define *their own* extra purchase-invoice
fields on top of this fixed set, that's the moment to revisit widening
the generic custom-fields system — not before there's a real
requirement for it.

### 1.5 Payments: new `VendorPayment` model, not an extended `Payment`

`Payment` today (`invoiceId`, `amount`, `method`, `paidAt`, `note`,
`recordedByUserId`) is structurally exactly what an outgoing payment
needs too. The tempting move is a nullable `invoiceId`/new nullable
`purchaseInvoiceId` pair on one shared table. Recommendation against
that:

- **A nullable FK pair invites a row with both or neither set** —
  either a CHECK constraint to hand-write and keep in sync, or an
  application-level rule that's one missed code review away from a
  Payment nobody can trace to any invoice. `docs/payment-tracking-
  design.md` chose auditability over convenience for the *existing*
  model for the same class of reason; a shared polymorphic table
  reintroduces exactly the ambiguity that design explicitly avoided.
- **The direction is semantically different**, not just a label swap.
  `Payment.amount` is money *received*; `VendorPayment.amount` is money
  *paid out*. `deriveInvoiceStatus()`
  (`lib/documents/status.ts`) already encodes AR-specific status
  transitions (`overdue`, `partially_paid` from the *receiving* side);
  an AP equivalent needs its own derivation function anyway (§2), so
  little is actually shared besides the row shape.
- **Every existing `Payment` query already filters by `invoiceId`
  pointing at a `Document`** (`payments/route.ts`,
  `reverse-last/route.ts`, `document-preview.tsx`'s payment list). A
  shared table changes none of that code but adds a column those
  routes must now know to ignore — no benefit, only surface area.

```prisma
model VendorPayment {
  id                String   @id @default(uuid())
  purchaseInvoiceId String   @map("purchase_invoice_id")
  amount            Decimal  @db.Decimal(12, 2)
  method            String?
  paidAt            DateTime @map("paid_at")
  note              String?

  recordedByUserId String? @map("recorded_by_user_id")

  createdAt DateTime @default(now()) @map("created_at")

  purchaseInvoice PurchaseInvoice @relation(fields: [purchaseInvoiceId], references: [id], onDelete: Cascade)
  recordedBy      User?           @relation(fields: [recordedByUserId], references: [id], onDelete: SetNull)

  @@index([purchaseInvoiceId, paidAt])
  @@map("vendor_payments")
}
```

Field-for-field identical shape to `Payment` (deliberately — same
audit-trail reasoning, see §7), just its own table and its own FK
target. `User.recordedPayments`/`recordedVendorPayments` become two
separate back-relations on `User`, same as `createdDocuments` and any
future `createdPurchaseInvoices`.

### 1.6 Numbering

`lib/documents/numbering.ts`'s `DocumentCounter` is keyed on the
`DocumentType` enum specifically (`Record<DocumentType, string>`
prefixes, `@@unique([businessId, type, year])`). A purchase invoice
doesn't need a *generated* number at all — §1.2 already notes
`vendorInvoiceNumber` is the vendor's own number, never ours to assign.
If a later phase wants an internal reference (e.g. for a printed
payment voucher), that's a new, narrowly-scoped counter at that time —
nothing here needs one in Phase 1.

### 1.7 Migration strategy

Three migrations, in dependency order, run separately so each is
independently revertable and reviewable:

1. `add_vendor` — creates `vendors`. No dependents yet, so this alone
   unblocks §10 stage (a) (Vendor CRUD) shipping and being used before
   stage (b) exists.
2. `add_purchase_invoice_status_enum_and_purchase_invoice` — creates
   `purchase_invoice_status` enum, `purchase_invoices`,
   `purchase_line_items`. Depends on `vendors` existing
   (`PurchaseInvoice.vendorId` FK).
3. `add_vendor_payment` — creates `vendor_payments`. Depends on
   `purchase_invoices` existing.

Each is a pure `CREATE TABLE`/`CREATE TYPE` — no existing table is
altered, no backfill, no data migration risk. `npx prisma migrate dev`
on dev, `npx prisma migrate deploy` on production, same as every prior
feature this project has shipped.

---

## 2. Status flow

```
received → approved → partially_paid → paid
   ↓           ↓
cancelled   cancelled
```

| Transition | Who | How |
|---|---|---|
| (create) → `received` | Owner/Admin/Manager (§8) | POST — the default status the moment a purchase invoice is entered (§5); "we have this bill, haven't reviewed it yet." |
| `received` → `approved` | Owner/Admin only (§8) | A dedicated "Approve" button/route, same one-way-ish shape as `POST /api/documents/:id/finalize` — signs off that the invoice is legitimate and should be paid. Not a general-purpose status PATCH, for the same reason `finalized` isn't: it's a distinct, audited action, not a field edit. |
| `received`/`approved` → `cancelled` | Owner/Admin/Manager | Dead end, mirrors `Document`'s `cancelled`. A cancelled purchase invoice can't be paid (`canRecordPayment`-equivalent below excludes it) or re-approved. |
| `approved` → `partially_paid` / `paid` | Derived, never set directly | Same shape as `deriveInvoiceStatus()` — written only inside the payment-recording transaction (§7), based on `amountPaid` vs `total`. |
| any → `received`/`approved` (reverse) | Nobody, directly | No "un-approve." If an approved invoice turns out wrong, Phase 1's answer is the same as sales documents' finalize: cancel it and re-enter it correctly. Reconsidering this is explicitly out of scope (§9 doesn't list it, but it's the same one-way-door philosophy already established for `finalized`). |

Difference from `Document`'s vocabulary worth calling out: there is no
`draft` here. A purchase invoice is a record of something that already
happened (the vendor already issued it) — there's no "not yet ready to
show anyone" phase the way a sales quotation has before it's sent.
`received` is the vocabulary's own starting point, playing the role
`draft` plays for editability: **editable only in `received`**, same
`isEditableStatus`-shaped rule, locked from `approved` onward.

**Explicit answer to "can Staff edit their own `received` invoice?":
yes.** Any Staff member with `purchase_invoices.edit` (§8) can edit an
invoice in `received` status within their normal mutate scope (§8's
`purchaseInvoiceScopeWhere` — own invoices, or subtree for a Manager),
the same way `invoices.edit` lets Staff correct a `draft`/pre-lock
sales document. This matters concretely: entry is manual (§5), so a
typo in a line item or a shipment-detail field is a realistic everyday
correction, not an edge case. The lock takes effect at `approved`, not
at `received` — `received` is the editable state, `approved` is the
frozen one. This is the one clarification worth stating as a rule
rather than leaving implicit: `received` is NOT itself a lock. This
also means there's no `PurchaseInvoiceType`-keyed manually-settable-set
table the way `MANUALLY_SETTABLE_STATUSES` is — the vocabulary is a
single flat list, not per-type, so it can be one plain array plus the
same `isValidStatus`/`requireEditableDocument`-shaped helper functions
in a new `lib/purchase-invoices/status.ts`, not additions to the
existing `lib/documents/status.ts` (which is explicitly typed around
`DocumentType`).

**Recommendation: a separate status enum/vocabulary**, not
`DocumentStatus` reuse — `received`/`approved` have no sales-document
equivalent, and `INVOICE_STATUSES`'s `finalized`/`sent`/`viewed`/
`overdue` have no purchase-invoice equivalent. Forcing one vocabulary
to cover both would mean either meaningless states on one side or a
per-type filtered subset — which is exactly the problem the code
comment at the top of `lib/documents/status.ts` already explains
`Document.status` avoiding by *not* being a DB enum. Here, though, a
real Postgres enum is the right call (§1.2's `PurchaseInvoiceStatus`):
there's only one vocabulary, not three mutually exclusive ones, so
none of the reasons that pushed `Document.status` to a plain validated
string apply.

---

## 3. Navigation

Sidebar (`components/layout/sidebar-nav.tsx`'s `NAV_ITEMS`): a new
entry, **"Purchase invoices,"** with its own icon (`ShoppingCart` or
`FileInput` from `lucide-react`, matching the existing
grid/document/person/box iconography style), placed after "Proforma
invoices" and before "Customers" — grouping the three sales-document
types together, then the two counterparty-management sections
(Customers, then a new **"Vendors"**) back to back, then Products,
then Settings:

```
Dashboard
Quotations
Invoices
Proforma invoices
Purchase invoices   ← new
Customers
Vendors             ← new
Products
Settings
```

Dashboard (`app/(app)/dashboard/page.tsx`'s `QUICK_ACTIONS`): two new
entries, **"Record purchase invoice"** and **"Add vendor,"** same
`{ href, label, icon }` shape as the existing five. Whether the
dashboard's metrics cards (`getDashboardMetrics`) gain an AP-side
figure (e.g. "Total payable") is a real product question, but cheap to
add in the same pass as stage (c) (§10) once `amountPaid`/`total` exist
to aggregate — not blocking Phase 1's core scope either way.

No public/customer-facing surface at all (§0, point 3) — no
`/public/purchase-invoices/[token]` route, no "Send" button. This is
the single largest surface-area reduction versus copying the
`Document` feature set.

---

## 4. Vendor management

Its own top-level section (`/vendors`, list + `/vendors/[id]` detail),
**not folded into Settings** — Settings today holds business-wide
configuration (Business profile, Tax, Payment details, Documents,
E-invoicing, Custom fields, Appearance, Account, Team); vendors are
operational records with their own volume and lifecycle (created,
referenced by invoices, occasionally deactivated), the same category
`Customer`/`Product` are already in as their own sidebar sections, not
Settings tabs. Mirrors `app/(app)/customers/page.tsx` and
`app/(app)/customers/[id]/page.tsx` almost exactly:

- `/vendors` — list, search (name/GSTIN, same `CustomerSearch`-shaped
  component), "Add vendor" dialog (same `AddCustomerDialog` shape:
  `next/dynamic`-loaded, zod + react-hook-form, per the bundle-size
  lesson already learned and written up for exactly this class of
  dialog).
- `/vendors/[id]` — detail page: vendor info, edit dialog, and a table
  of this vendor's purchase invoices (mirrors the customer detail
  page's own document history table), so "how much do we owe Pacific
  Ocean Logistics right now" is answerable from one screen without
  waiting for §9's vendor-statement feature.

Fields (per §1.1): name, email, phone, address, city, state, GSTIN,
PAN, CIN, and the bank-details block (bank name, account holder,
account number, IFSC, UPI) — same validation tier as
`lib/validation/customer.ts` for the identity fields, same soft-length-
hint (not hard-enforced) treatment `lib/validation/business.ts` already
gives IFSC/PAN/CIN for the identical reason: a formatting quibble
shouldn't block saving a real registration number the business already
has correct.

---

## 5. Purchase invoice builder

**Manual entry only for Phase 1.** Being direct about the alternative:
upload-and-parse (take the vendor's PDF, extract vendor/line-item/tax
fields automatically) needs real OCR or an LLM-vision extraction step,
a confidence/review UI for when extraction gets a field wrong, and
almost certainly per-vendor template learning once there's more than a
handful of vendors with wildly different invoice layouts. That is a
legitimately large, separate feature — not a Phase 1 add-on, not
something to half-build now and finish later. Phase 1 explicitly does
not attempt it.

Manual entry, mirroring `document-builder.tsx`'s existing shape
closely enough that a user who already knows the sales-invoice builder
needs no new mental model:

1. **Vendor** — `VendorPicker` (same `CustomerPicker` shape:
   search-and-select, "+ Add new vendor" inline via the same
   `QuickAddCustomerDialog`-shaped dynamic-imported dialog).
2. **Vendor's own invoice number + date, due date** — plain fields,
   typed in from the paper/PDF in hand.
3. **Shipment details** — the fixed field set from §1.4, one screen
   section, all optional.
4. **Line items** — description, SAC, qty, unit, rate, GST rate;
   taxable amount/CGST/SGST/IGST computed the same way
   `calculateDocumentTotals`/`calculateGST` already do (reused
   directly — the tax math is currency- and direction-agnostic; only
   the *shape* of what's taxed differs, not the arithmetic). FC/INR
   columns appear only when currency ≠ INR, same conditional-column
   pattern `resolveLineItemColumns`/`resolveForeignCurrencyRateLabel`
   already implement for sales line items.
5. Save as `received`.

No draft-created-immediately-on-"New" pattern the way
`document-builder.tsx` does (creating an empty row the instant "New
Invoice" is clicked, so autosave has something to PATCH against) is
strictly required, but matching it anyway is the pragmatic move: same
autosave-while-editing UX, same "editable only while young" rule
(§2), reusing the same interaction pattern users already know rather
than inventing a save-only-on-submit flow.

---

## 6. PDF rendering

**A dedicated renderer, not `document-pdf.tsx` reuse** — the reference
PDF's structure is different enough that forcing it through the
existing component would mean threading a purchase-invoice-only branch
through nearly every section of an 850-line file (`document-pdf.tsx`
today) that has zero other purchase-invoice awareness. Concretely,
sales invoices have no equivalent of:

- A tax-summary-by-rate table as its own block (sales invoices fold
  this into the totals column; the reference PDF shows it as a
  standalone table with one row per GST rate in play).
- "Total in words" — a genuinely new utility
  (`lib/documents/amount-in-words.ts` or similar; confirmed nothing
  like this exists anywhere in the codebase today). Indian
  lakhs/crores grouping, not the international thousands grouping a
  generic npm package would default to — this needs to be written
  in-house or with a package specifically supporting the Indian
  numbering system, checked at implementation time. **Corrected after
  seeing the real PDF:** the exact printed format is `"<CURRENCY>
  <INTEGER PART IN WORDS> AND <DECIMAL PART AS NUMBER-WORDS> ONLY"` —
  e.g. "INR FORTY-THREE THOUSAND EIGHT HUNDRED NINETY-SIX AND
  FIFTY-NINE ONLY" for ₹43,896.59. No literal "Rupees"/"Paise" words
  anywhere; the currency code itself (`INR`) is the only unit marker,
  and the decimal part is spelled out as a plain number-in-words, not
  "cents"/"paise" phrasing. The lakhs/crores grouping rule still
  applies for larger amounts even though this particular example
  doesn't cross into lakhs.
- Dual FC/INR columns on every line item, not a single optional
  sub-line.
- The vendor as the letterhead-holder and the business as "Bill To" —
  the exact inverse of every existing header layout
  (`document-pdf.tsx`'s `headerLeftBlock` assumes *our own* logo/name
  always anchors the page).

**Corrected after seeing the real PDF — concrete layout, now observed
directly rather than inferred:**

- A full-width **"Draft Invoice"** title banner at the top (this
  reference copy is itself a draft; the app's own renderer should just
  print whatever `PurchaseInvoiceStatus` implies, or simply "Invoice" —
  there's no draft/final PDF distinction proposed for Phase 1, §2).
- A two-column header card below the title: **left = vendor block**
  (name, address, GSTIN, PAN, CIN — the letterhead side, sourced from
  `vendorSnapshot`), **right = Bill To block** (our own business,
  sourced from `businessSnapshot`, plus vendor's own invoice number/
  date/due date). This is the mirror image of `document-pdf.tsx`'s
  `headerLeftBlock`/`headerRightBlock`, not a new layout primitive —
  same two-column card, contents swapped.
- A solid-blue section-header banner style used repeatedly as a
  visual divider — one above "Bill To," one above "Shipment Details
  For," and again as the line-items table's own header row background.
  Reuse as a single shared style constant in the new renderer file
  rather than restating the color/padding per section.
- **Shipment Details** block: a labeled grid (roughly 3 columns ×
  7 rows) rendering the fixed field set from §1.4, blank fields simply
  omitted or shown empty — not a table with borders, closer to the
  label/value pairs style `document-pdf.tsx` already uses for its own
  reference-fields section.
- **Line items table**: grouped column headers — `CGST`, `SGST`, and
  `IGST` each span two sub-columns (`Rate` / `Amt`) under one merged
  header cell, with `Description`, `SAC`, `Qty`/`UOM`, `Rate`,
  `Currency`/`Ex. Rate`, `Invoice Amount (FC)`, `Invoice Amount (INR)`,
  `Taxable Value` as the leading plain columns. `@react-pdf/renderer`
  has no native colspan; the existing table primitives in
  `document-pdf.tsx` will need a small addition (a merged-header-cell
  helper) rather than a wholly new table component, since the row/cell
  spacing and font rules should still match.
- **Tax summary table**, a standalone block below the line items:
  one row per GST rate in play, columns `Taxable Value`, `CGST` (rate +
  amount), `SGST/UTGST` (rate + amount), `IGST` (rate + amount), `CESS`
  (rate + amount) — this is the concrete source for
  `PurchaseInvoice.cess`/`PurchaseLineItem.cess` (§1.2, §1.3): a real
  printed column, always 0 for freight/logistics, but present in the
  table structure regardless.
- **Totals block**: "Total Invoice" (raw total), then "Rounded:"
  (the `roundingAdjustment` delta, §1.2), then "Net Total:" (the final
  rounded figure) — three distinct lines, not one. The "Total in
  Words" line sits directly below this block, above the signature/
  bank-details footer.
- **Bank Details** block at the bottom: a simple label/value list
  (Bank Name, Account Name, Account No., IFSC/RTGS-NEFT code, Swift
  Code), sourced from `Vendor`'s bank fields (§1.1) — this is the one
  block that differs between the reference PDF's two pages (page 1
  omits the values, page 2 fills them in), confirming the intro note's
  read that page 2 is a PDF-generator overflow artifact, not a second
  layout to support.
- **Place of Supply**: seen in the Bill-To block, tied to a state name
  + state code (e.g. "TAMIL NADU" / "33") on the business (recipient)
  side. This determines the CGST+SGST-vs-IGST split the same way sales
  documents already do — reuse `isSameState()`
  (`lib/tax/calculateGST.ts`) directly, just with the comparison
  reversed in *which* two parties it's comparing: vendor's registered
  state (`Vendor.state`, §1.1) vs. our own GST-registered state
  (`Business.placeOfSupply`), instead of `Business.placeOfSupply` vs.
  `Customer.state`. No new tax-math function needed — the existing one
  is already state-pair-agnostic; only which two fields feed it
  changes.

**What genuinely is shared**, and should be imported/reused rather
than re-derived: the `Font.register()` Noto Sans + ₹-glyph setup, the
hyphenation-callback fix, `formatCurrency`, `formatDateIST`, and the
tax math (`calculateGST`/`groupTaxByRate`) — all of that is either
pure formatting utility or currency-direction-agnostic math, with
zero purchase-vs-sales awareness baked in. A new
`lib/pdf/purchase-invoice-pdf.tsx` sibling to `document-pdf.tsx`,
built from the same `@react-pdf/renderer` primitives and importing
those shared utilities, is the right shape — same relationship
`lib/pdf/document-pdf.tsx` has to `lib/pdf/render.tsx`
(`renderPurchaseInvoicePdf` alongside `renderDocumentPdf`).

No web preview is proposed for Phase 1's PDF — sales documents have
one because a customer might view it before it's finalized/downloaded
via the public share link; a purchase invoice has no such audience.
"Download PDF" straight from the detail page is enough; skip building
a live web-rendered preview of a document nobody but internal staff
ever looks at, and even they have the vendor's original PDF/paper copy
already in hand as the source of truth.

---

## 7. Payment tracking

Deliberately the *same design*, direction reversed, reusing
`docs/payment-tracking-design.md`'s already-reviewed shape rather than
inventing a new one:

- **`VendorPayment`** is the audit trail (§1.5); `PurchaseInvoice.
  amountPaid` is the maintained running total, updated inside the same
  `prisma.$transaction` as every insert/delete, exactly like
  `Document.amountPaid`. **Explicit choice, stated so it isn't left to
  the implementer:** `amountPaid` is a maintained column written
  alongside the `VendorPayment` row inside one transaction — never
  derived by summing `VendorPayment` rows on read (e.g. inside
  `lib/purchase-invoices/status.ts`'s status-deriving function on every
  PATCH). Same reasoning as the sales side: a maintained column is one
  value to keep consistent inside a transaction versus an aggregate
  query on every read, and `Document.amountPaid` already established
  this as the pattern — no reason to diverge for the AP mirror.
- **"Record payment"** — `POST /api/purchase-invoices/:id/payments`,
  mirroring `payments/route.ts` field-for-field: amount (defaults to
  remaining balance, editable for a partial payment), optional
  paidAt/method/note. Same overpayment-becomes-credit-balance rule
  (§below) as the AR side — never rejected, never silently truncated.
- **"Reverse last payment"** — `POST /api/purchase-invoices/:id/
  payments/reverse-last`, same shape as `reverse-last/route.ts`:
  removes the most recent `VendorPayment`, recomputes status, leaves a
  trace note (mirrors the existing route's own "reversed by X on
  DATE" note appended to `notes` — same field exists on
  `PurchaseInvoice`, §1.2).
- **Status derivation** — a `deriveVendorInvoiceStatus(currentStatus,
  total, amountPaid)` in the new `lib/purchase-invoices/status.ts`,
  same logic shape as `deriveInvoiceStatus()` but returning
  `PurchaseInvoiceStatus`. `remainingBalance`/`creditBalance` are the
  exact same two pure functions (`lib/documents/status.ts` already
  exports them un-opinionated about direction) — reused directly, not
  reimplemented.
- **UI** — same two buttons/dialogs on the purchase invoice detail
  page that `document-preview.tsx` already has for sales invoices
  (`Record payment`/`Reverse last payment`), same defaulting and
  validation.

What's explicitly *not* proposed: an equivalent of `showRecordedBy`'s
in-app-only visibility rule (`docs/payment-tracking-design.md §6`) —
that rule exists because a customer might view a sales invoice via the
public share link and shouldn't see who on staff recorded a payment.
Purchase invoices have no such external viewer (§6), so there's no
customer-facing surface to hide the recorder's name from in the first
place; it can simply always be shown wherever payments are listed.

---

## 8. Permissions

Read `lib/auth/permissions.ts` before proposing: the catalog is a flat
`PERMISSIONS` array, `STAFF_PERMISSIONS` grants most of it to Staff
outright, `MANAGER_ONLY_PERMISSIONS` is a single-entry list
(`reports.view`) layered on top via the derived (not stored) `isManager()`
check, and `owner`/`admin` short-circuit to (almost) everything before
the catalog is even consulted.

Two new catalog entries:

```ts
"vendors.view", "vendors.create", "vendors.edit", "vendors.delete",
"purchase_invoices.view", "purchase_invoices.create", "purchase_invoices.edit", "purchase_invoices.delete",
```

added to `STAFF_PERMISSIONS` alongside the existing `customers.*`/
`invoices.*` — vendor CRUD and purchase-invoice *entry* are
operationally identical to their sales-side counterparts (a Staff
member who can create a sales invoice can reasonably enter a purchase
invoice they received too), so the same tier is the honest default,
not a tightened one invented without cause.

**Payments are the one place to tighten, and the request is right to
ask.** `invoices.edit` today covers recording a sales *payment*
(`payments/route.ts` calls `requirePermission("invoices.edit")`)
because receiving money is low-risk to delegate widely. Paying a
vendor is outgoing money — a materially different risk. Recommendation:
a new **`purchase_invoices.pay`** permission, granted only to
`owner`/`admin` (i.e., *not* added to `STAFF_PERMISSIONS`, so Staff and
even a derived Manager cannot record or reverse a vendor payment
without it — same mechanism `ADMIN_EXCLUDED_PERMISSIONS` uses to carve
an exception the other direction, just inverted: this one is
granted to owner+admin only, by simply never appearing in
`STAFF_PERMISSIONS` or `MANAGER_ONLY_PERMISSIONS`). This is a real,
deliberate divergence from "same tier as Document mutations" — argued
for, not assumed, per the request's own framing of the choice.

**Approval** (`received` → `approved`, §2) similarly sits with
`owner`/`admin` only — approving a bill for payment is the financial
control point this whole status flow exists to create; if Staff can
approve their own entered invoice, the two-step review that
`received`/`approved` is supposed to buy disappears. No new permission
needed for this specifically — reuse `purchase_invoices.pay`'s same
owner/admin-only tier rather than minting a third permission for a
closely related financial control, unless product feedback later shows
a real need to grant "can approve" without "can pay" independently.

**Visibility scope** (`lib/documents/visibility.ts`'s
`documentScopeWhere`): purchase invoices get their own
`purchaseInvoiceScopeWhere`, same two-tier `view`/`mutate` shape
(owner/admin see everything; everyone else, `view` = own + subtree,
`mutate` = own only), reusing `resolveSubtreeUserIds` from
`lib/business/hierarchy.ts` directly — the hierarchy-visibility
concept is document-type-agnostic already; only the Prisma model being
filtered changes.

---

## 9. Explicitly out of scope for Phase 1

Naming these so the design doesn't accidentally grow into them
mid-implementation:

- **Reconciliation against sales invoices.** No linking a purchase
  invoice to the sales invoice(s) it relates to, no "cost vs revenue on
  this job" view. `PurchaseInvoice.jobRef`/`customerRef` are stored
  verbatim as freeform text (matching the reference PDF) precisely so
  that data exists *for a future phase* to build reconciliation against
  — Phase 1 does not attempt to match it to anything automatically.
- **Job-based P&L.** No aggregation tying a shipment's revenue (sales
  invoice) to its cost (purchase invoices) into a per-job margin. This
  is the natural next phase once reconciliation (above) exists, not
  before.
- **Vendor statements.** No "statement of account" PDF/email
  summarizing a vendor's open invoices over a period, the AP mirror of
  a feature this codebase doesn't have on the AR side either. The
  vendor detail page's own invoice table (§4) is Phase 1's substitute.
- **GST input tax credit (ITC) tracking.** No ITC-eligibility flag, no
  2A/2B reconciliation, no claim tracking. `PurchaseInvoice.cgst`/
  `sgst`/`igst` are recorded because they're on the vendor's invoice and
  needed to compute `total` — recording them is not the same as
  *tracking* them for ITC purposes, and Phase 1 does not add anything
  that treats them as ITC-relevant data.
- **Upload-and-parse entry** (§5) — manual entry only.
- **Sending or sharing a purchase invoice anywhere** (§0, §3, §6) — it
  has no external audience by definition.
- **An "un-approve" or "un-cancel" action** (§2) — one-way doors only,
  matching `finalized`'s existing precedent; revisit only if real usage
  shows this is genuinely needed, not preemptively.

---

## 10. Staged implementation plan

Each stage independently shippable and verifiable — typecheck, lint,
full test suite, production build, and a live check, same standard
every prior feature in this codebase has met, before moving to the
next stage.

**(a) Vendor CRUD**
Migration 1 (§1.7). `Vendor` model, `lib/validation/vendor.ts`
(mirrors `lib/validation/customer.ts`), `/vendors` + `/vendors/[id]`
pages and dialogs (mirrors the `Customer` pages closely), the two new
`vendors.*` permission-catalog entries (§8) added to
`STAFF_PERMISSIONS`, sidebar entry. Fully usable and demoable on its
own — a real CRUD feature, not scaffolding. Verification: create/edit/
deactivate a vendor, confirm Staff/Admin/Owner tiers behave as
expected, confirm a vendor with no purchase invoices yet can still be
hard-deleted (no FK exists to restrict it until stage (b) ships).

**(b) Purchase invoice entry and PDF**
Migration 2 (§1.7). `PurchaseInvoice`/`PurchaseLineItem` models,
`lib/purchase-invoices/status.ts` (§2), the builder (§5), the detail/
list pages, `lib/pdf/purchase-invoice-pdf.tsx` (§6) plus the new
amount-in-words utility, the `purchase_invoices.*` permission entries.
**Explicit scope note:** the amount-in-words utility (§6) is in scope
for this stage, not deferred — the PDF is not a faithful reproduction
of the reference layout without it, and there's no intermediate PDF
worth shipping that omits a line the reference invoice always prints.
No payment UI yet — a purchase invoice can reach `approved` but nothing
lets it become `partially_paid`/`paid` in this stage. Verification:
enter a purchase invoice end-to-end (vendor, shipment details, FC and
INR line items, mixed GST rates), download the PDF and inspect it
against the reference PDF's layout the same way every PDF-layout
change in this project has been verified (generate a real PDF via the
vitest+sips pattern, not just eyeball the web form), confirm approve/
cancel transitions and their permission gates.

**(c) Payment tracking**
Migration 3 (§1.7). `VendorPayment` model, the two payment routes
(§7), `purchase_invoices.pay` permission (§8), the Record/Reverse UI
on the detail page. Verification: record a partial payment (confirm
`partially_paid`), pay in full (confirm `paid`), overpay (confirm
credit balance, not a rejection), reverse the last payment (confirm
status recomputes and a trace note appears), confirm Staff is blocked
from both actions without `purchase_invoices.pay` while Admin/Owner
succeed.

Recommended order is exactly (a) → (b) → (c) as listed — each stage is
a strict prerequisite for the next (§1.7's migration dependency order
already reflects this), and each is substantial enough to review and
sign off independently rather than reviewing all three at once at the
end.
