You are the lead full-stack engineer building **InvoiceFlow**, a production-quality multi-tenant quotation and invoice SaaS for small businesses, freelancers, agencies, consultants and traders in India.

I have provided a complete product and technical specification for InvoiceFlow. Treat that specification as the primary source of truth.

Do NOT immediately generate the entire application in one pass.

First inspect the repository, understand the existing structure, and create a concise implementation plan. Then implement the application incrementally in logical phases.

---

# PRODUCT

InvoiceFlow allows businesses to:

* Create quotations
* Create invoices
* Convert quotations into invoices
* Manage customers
* Manage products/services
* Configure GST
* Generate professional documents
* Customize document appearance
* Export PDFs
* Send documents by email
* Manage business settings
* Support multiple users per business

The primary UX goal is:

**A new user should be able to create a professional quotation or invoice within approximately 2 minutes.**

The application should feel simple and modern rather than like traditional accounting software.

---

# SOURCE OF TRUTH

Use the supplied:

**InvoiceFlow — Product & Technical Spec**

as the product requirements.

Use the supplied Claude Design export / HTML prototype as the visual reference wherever available.

Before implementing UI components, inspect the design/reference files and preserve the intended:

* layout
* typography
* spacing
* colors
* component hierarchy
* document preview appearance
* interaction patterns

Do not unnecessarily redesign the product.

---

# TECHNOLOGY

Use:

* Next.js
* App Router
* TypeScript
* Supabase Postgres (database)
* Prisma (ORM, pointed at Supabase Postgres)
* Clerk authentication
* Tailwind CSS
* shadcn/ui where useful
* Supabase Storage for business logos/files
* Resend for transactional email (document sending)
* react-pdf for initial PDF generation
* Vercel-compatible architecture

Use a single vendor (Supabase) for both the database and file storage — do not introduce a second database provider (e.g. Neon).

Use server-side logic for sensitive operations.

Do not expose database credentials or secrets to the client.

---

# ARCHITECTURE

Use a clean modular architecture.

Suggested structure:

```text
app/
  (auth)/
  dashboard/
  quotations/
  invoices/
  customers/
  products/
  settings/
  api/
  public/
    documents/[token]/

components/
  ui/
  dashboard/
  documents/
  customers/
  products/
  settings/

lib/
  auth/
  db/
  tax/
  documents/
  pdf/
  email/
  validation/
  storage/

prisma/
  schema.prisma
  migrations/
```

Keep business logic separate from UI components.

Do not put tax calculations, authorization logic or document calculations directly inside React components.

---

# MULTI-TENANCY

This is a multi-tenant SaaS.

Data isolation is critical.

The relationship is:

```text
User
  ↓
BusinessMember
  ↓
Business
  ↓
Customers
Products
Documents
```

Every business-owned record must contain:

```text
businessId
```

Every database query involving tenant-owned data must be scoped by the authenticated user's business membership.

Never fetch a business-owned record only by its ID.

Bad:

```ts
prisma.customer.findUnique({
  where: { id }
})
```

Preferred:

```ts
prisma.customer.findFirst({
  where: {
    id,
    businessId
  }
})
```

This rule applies to:

* Customers
* Products
* Documents
* LineItems
* Payments
* Business settings
* Any future tenant-owned entity

Prevent cross-tenant reads and writes.

---

# AUTHENTICATION

Use Clerk.

Support:

* Email/password
* Google OAuth

A user may belong to one or more businesses.

Roles:

```text
owner
staff
```

Owner:

* Full access
* Business settings
* Tax settings
* Billing
* Staff management

Staff:

* Create/edit quotations
* Create/edit invoices
* Customers
* Products/services

Staff cannot modify:

* Business settings
* GST settings
* Billing
* Staff permissions

Create authorization helpers such as:

```ts
requireAuth()
requireBusiness()
requireBusinessOwner()
requireBusinessMember()
```

Do not duplicate authorization logic throughout the application.

---

# DATABASE

Implement the database using Prisma against Supabase Postgres.

Core entities:

```text
Business
User
BusinessMember
Customer
Product
Document
LineItem
Payment
```

Use proper:

* foreign keys
* indexes
* unique constraints
* timestamps
* cascading behavior where appropriate

Important indexes should include:

```text
businessId
businessId + document type
businessId + status
businessId + customerId
```

Document numbers must be unique within a business.

---

# DOCUMENT MODEL

Quotation and Invoice should share a common Document model.

```text
Document
  id
  businessId
  type
  number
  customerId
  issueDate
  dueDate
  validUntil
  paymentTerms
  validityTerms
  status              // String — see STATUS HANDLING below, not a DB enum

  subtotal
  discountTotal
  taxableAmount
  cgst
  sgst
  igst
  total

  currency

  template
  accentColor

  showLogo
  showGstinRow
  showTax
  showPayment
  showNotes
  showTerms

  notes
  termsText

  convertedFromQuotationId

  shareToken          // unique, nullable — used for the public view link
  sentAt               // set only by POST /api/documents/:id/send
  viewedAt              // set only when the public share link is opened

  customerSnapshot
  businessSnapshot

  createdAt
  updatedAt
```

Quotation statuses:

```text
draft
sent
viewed
accepted
declined
expired
converted
```

Invoice statuses:

```text
draft
sent
viewed
partially_paid
paid
overdue
cancelled
```

Do not use one shared status enum if it creates invalid states for a document type.

## STATUS HANDLING

Prisma's `status` column is a plain `String`, not a database-level enum.

The two status vocabularies above are mutually exclusive and cannot both be expressed by a single Postgres/Prisma enum without allowing invalid states on one document type or the other. Instead:

* Store `status` as `String` in `prisma/schema.prisma`.
* Define the two allowed value sets in application code, e.g.:

```text
lib/documents/status.ts
  QUOTATION_STATUSES
  INVOICE_STATUSES
  isValidStatus(type, status): boolean
  getAllowedTransitions(type, currentStatus): string[]
```

* Validate every status write (API layer, not just UI) against the set matching the document's `type`.
* Do not let any code path set `status = "sent"` except the send endpoint below, and do not let any code path set `status = "viewed"` except the public share-link view handler.

---

# SNAPSHOT DATA

When a document is created, preserve the business and customer information used for that document.

Do not dynamically render historical invoices using the customer's current profile.

For example, if a customer changes:

* address
* company name
* GSTIN
* phone

an old invoice must remain unchanged.

Store appropriate snapshot data on the document.

---

# LINE ITEMS

Each document can contain multiple line items.

Support:

* Existing product/service
* Free-text item

Fields:

```text
name
description
qty
rate
discountPct
amount
gstRate
```

Amount should be calculated from the source values.

Do not trust client-submitted totals.

Recalculate totals server-side before persisting important document changes.

---

# GST

Implement Indian GST logic.

If:

```text
gstEnabled = false
```

then:

* Do not display GST fields
* Do not calculate tax
* Do not display CGST
* Do not display SGST
* Do not display IGST

If GST is enabled:

Compare:

```text
Business.placeOfSupply
```

with:

```text
Customer.state
```

Same state:

```text
GST = CGST + SGST
```

Each is half of the applicable GST rate.

Different state:

```text
GST = IGST
```

Use the product's GST rate if available.

Otherwise:

```text
Business.gstDefaultRate
```

Allow line-item GST rate overrides.

Example:

₹10,000 at 18% GST:

Same state:

```text
CGST = ₹900
SGST = ₹900
Total = ₹11,800
```

Different state:

```text
IGST = ₹1,800
Total = ₹11,800
```

Create a dedicated tax calculation module.

For example:

```text
lib/tax/
  calculateGST.ts
  calculateDocumentTotals.ts
```

Write unit tests for GST calculations.

---

# MONEY CALCULATIONS

Do not use floating-point arithmetic for financial calculations.

Use integer minor units or Decimal.

Example:

```text
₹10,000
```

should not be represented internally as an unsafe JavaScript floating-point calculation.

Prisma Decimal is acceptable.

Centralize calculations in:

```text
lib/documents/calculations.ts
```

Test:

* subtotal
* discount
* taxable amount
* CGST
* SGST
* IGST
* grand total
* rounding

---

# DOCUMENT NUMBERING

Automatically generate numbers such as:

```text
QT-2026-0001
QT-2026-0002

INV-2026-0001
INV-2026-0002
```

Numbering must be:

* unique per business
* concurrency-safe
* configurable later from Settings

Do not generate document numbers using a simple client-side count.

Handle concurrent document creation safely.

---

# ONBOARDING

Create a 4-step onboarding flow.

### Step 1 — Business details

Fields:

* Business Name
* Email
* Phone
* Address
* City
* State
* Country
* Website

### Step 2 — Logo

Optional.

Allow:

* Upload
* Preview
* Remove
* Skip

Store uploaded logos in Supabase Storage.

### Step 3 — GST

Ask:

**Do you charge GST?**

Options:

* Yes
* No

If yes:

* GSTIN
* Default GST rate
* Place of supply
* Registration type

### Step 4 — Template

Allow:

* Classic
* Modern
* Minimal

Save the selected template as the business default.

Every step should allow:

**Skip for now**

All onboarding settings must remain editable later.

---

# DASHBOARD

Create:

### Summary cards

* Total Revenue
* Outstanding
* Paid
* Drafts

### Quick actions

* Create Invoice
* Create Quotation
* Add Customer
* Add Product

### Recent documents

Display:

* Number
* Customer
* Type
* Date
* Amount
* Status

Use realistic empty states and mock/demo data during development if the database is empty.

---

# DOCUMENT BUILDER

This is the most important screen.

Create a reusable document builder shared between quotations and invoices.

Sections:

### Customer

* Select existing customer
* Add customer inline

### Document details

* Number
* Issue date
* Due date / valid until
* Payment terms / validity terms

### Line items

Editable rows.

Support:

* Add item
* Remove item
* Duplicate item
* Product selection
* Free-text item
* Quantity
* Rate
* Discount
* GST

### Totals

Show:

```text
Subtotal
Discount
Taxable amount
CGST
SGST
IGST
Total
```

Hide tax rows completely when GST is disabled.

Actions:

* Save Draft
* Preview
* Download PDF
* Send

Implement autosave carefully and avoid excessive API requests.

---

# DOCUMENT PREVIEW

Create a professional A4 document preview.

It should look like a real business document.

Include:

* Logo
* Business information
* GSTIN when applicable
* Document title
* Document number
* Date
* Customer information
* Items
* Tax breakdown
* Total
* Notes
* Terms
* Payment information

Templates:

```text
Classic
Modern
Minimal
```

Create reusable document-rendering components so the same data powers:

1. Web preview
2. PDF output
3. The public share-link view

Avoid maintaining separate implementations of the invoice layout.

---

# CUSTOMIZATION

Provide a customization sidebar in the preview.

Allow:

* Template selection
* Accent color
* Show/hide logo
* Show/hide GSTIN
* Show/hide tax breakdown
* Show/hide payment details
* Show/hide notes
* Show/hide terms

Changes should update the preview immediately.

The same settings must be used for PDF generation and the public share-link view.

---

# QUOTATIONS

Quotation list:

* Search
* Status filters
* Number
* Customer
* Date
* Valid until
* Amount
* Status
* Actions

Actions:

* View
* Edit
* Duplicate
* Download
* Send
* Convert to Invoice
* Delete

Conversion flow:

```text
Quotation
    ↓
Convert to Invoice
    ↓
Create new invoice
    ↓
Generate invoice number
    ↓
Preserve customer/items/tax data
    ↓
Mark quotation as converted
```

Never mutate the quotation into an invoice.

Create a separate invoice.

---

# INVOICES

Invoice list:

* Search
* Status filters
* Number
* Customer
* Date
* Due date
* Amount
* Status
* Actions

Actions:

* View
* Edit
* Duplicate
* Download
* Send
* Mark Paid
* Delete

For MVP, payment tracking can be simple.

Phase 2 can introduce the full Payment model.

---

# CUSTOMERS

Customer list:

* Name
* Company
* Email
* Phone
* Total invoiced
* Outstanding

Customer detail page:

* Contact information
* Total billed
* Outstanding
* Document count
* Document history

Provide:

**New Quotation**

shortcut.

---

# PRODUCTS & SERVICES

Fields:

```text
Name
Description
SKU
Unit
Price
GST rate
```

If GST is disabled for the business:

Do not show the GST column.

Allow products to be selected directly from the document builder.

---

# SETTINGS

Tabs:

### Business Profile

Business information and logo.

### Tax

GST settings.

### Documents

* Numbering
* Default template
* Default terms
* Default payment terms

### Appearance

* Accent color
* Template
* Document display settings

### Account

* User information
* Logout

Only owners can modify business/tax/billing settings.

---

# PDF

Implement PDF generation using react-pdf initially.

The PDF must:

* Use A4
* Preserve document styling
* Include logo
* Include GST/non-GST behavior
* Use the same totals as the preview
* Handle long line-item lists
* Handle multi-page documents
* Have clean page breaks

Create:

```text
lib/pdf/
```

Keep PDF generation isolated so it can later be replaced with Puppeteer if pixel-perfect HTML printing becomes necessary.

Downloading a PDF must never change a document's status. Status changes only happen through the endpoints described below.

---

# EMAIL & SHARE LINKS

Use Resend for transactional email.

### Sending a document

`POST /api/documents/:id/send` is the only code path allowed to set `status = "sent"` (and stamp `sentAt`).

On send:

1. Recalculate and validate totals server-side (never trust stale client state).
2. Generate the PDF via the shared rendering pipeline (same components as web preview).
3. Generate a `shareToken` for the document if one doesn't already exist.
4. Email the customer via Resend with the PDF attached and a link to the public share view.
5. Update `status` to `"sent"` and set `sentAt`.

### Public share view

`app/public/documents/[token]/` — an unauthenticated route that:

1. Looks up the document by `shareToken` only (never by internal `id`, and never exposes other tenant data).
2. Renders it using the same document-rendering components as the web preview/PDF.
3. On first load, sets `status = "viewed"` and stamps `viewedAt` — but only if the document isn't already past `viewed` in its status lifecycle (don't regress a `paid` invoice back to `viewed`).

This route is the only code path allowed to set `status = "viewed"`.

---

# API

Implement API routes for:

```text
POST   /api/business
GET    /api/business
PATCH  /api/business

GET    /api/customers
POST   /api/customers
GET    /api/customers/:id
PATCH  /api/customers/:id

GET    /api/products
POST   /api/products
PATCH  /api/products/:id

GET    /api/documents
POST   /api/documents
GET    /api/documents/:id
PATCH  /api/documents/:id

POST   /api/documents/:id/pdf
POST   /api/documents/:id/convert
POST   /api/documents/:id/mark-paid
POST   /api/documents/:id/send
POST   /api/documents/:id/share        // (re)generate/rotate the share token

GET    /public/documents/:token        // unauthenticated, sets status=viewed
```

Validate request payloads using a schema validation library such as Zod.

Return consistent error responses.

---

# SECURITY

Implement:

* Authentication checks
* Business membership checks
* Role checks
* Server-side validation
* Tenant isolation
* Safe file uploads
* No secret values exposed to browser
* Proper authorization on every mutation

Never rely on hidden UI buttons as authorization.

A staff user must not be able to modify owner-only settings by directly calling an API endpoint.

The public share route (`/public/documents/:token`) must not leak any data beyond the single document it resolves to — no business listing, no customer listing, no way to enumerate other tokens.

---

# UI QUALITY

The UI should be:

* Responsive
* Accessible
* Keyboard friendly
* Fast
* Consistent

Use reusable components.

Avoid giant monolithic components.

Use:

* Loading states
* Skeletons
* Empty states
* Error states
* Toast notifications
* Confirmation dialogs
* Form validation
* Unsaved changes protection where appropriate

Do not use placeholder text where actual UI is expected.

Do not create fake buttons that do nothing unless clearly marked as future functionality.

---

# DEVELOPMENT ORDER

Implement in this order:

## Phase 1

Project foundation:

* Next.js
* TypeScript
* Tailwind
* shadcn/ui
* Prisma
* Supabase Postgres
* Clerk
* Environment configuration

## Phase 2

Authentication + multi-tenancy:

* Clerk
* Business
* BusinessMember
* Authorization helpers
* Tenant isolation

## Phase 3

Onboarding:

* Business setup
* Logo upload (Supabase Storage)
* GST setup
* Template selection

## Phase 4

Core entities:

* Customers
* Products
* Documents
* LineItems

## Phase 5

Tax/calculation engine:

* GST
* CGST
* SGST
* IGST
* Discounts
* Totals
* Rounding
* Tests

## Phase 6

Document builder:

* Quotation
* Invoice
* Autosave
* Customer selection
* Product selection

## Phase 7

Preview + customization:

* Templates
* Live preview
* Appearance controls

## Phase 8

PDF & Sending:

* PDF generation
* Download
* Resend integration
* `POST /api/documents/:id/send`
* Public share route + `viewed` tracking

## Phase 9

Quotation → Invoice:

* Conversion
* Number generation
* Status handling

## Phase 10

Dashboard + settings:

* Metrics
* Recent documents
* Business settings
* Document settings

---

# TESTING

Before considering MVP complete, test:

### Authentication

* New user
* Existing user
* Google login
* Logout

### Tenant isolation

Create two businesses and verify that:

* Business A cannot access Business B customers
* Business A cannot access Business B invoices
* Business A cannot access Business B products
* Business A cannot modify Business B documents

### GST

Test:

* GST disabled
* Same-state CGST + SGST
* Inter-state IGST
* Different GST rates
* Multiple line items
* Discounts
* Zero tax

### Documents

Test:

* Create quotation
* Edit quotation
* Save draft
* Convert quotation to invoice
* Create invoice
* Mark invoice paid
* Duplicate document
* Download PDF (verify status unchanged)
* Send document (verify status becomes `sent`, `sentAt` set, email delivered)
* Open public share link (verify status becomes `viewed`, `viewedAt` set, no regression from a later status)

### PDF

Test:

* No GST
* GST
* Logo
* No logo
* Long descriptions
* Many line items
* Multiple pages
* All three templates

---

# IMPORTANT IMPLEMENTATION RULES

1. Do not skip the database design.
2. Do not implement fake multi-tenancy.
3. Do not trust client-side financial calculations.
4. Do not use floating-point arithmetic for money.
5. Do not duplicate document calculation logic.
6. Do not duplicate authorization logic.
7. Do not hard-code GST behavior into UI components.
8. Do not mutate quotations when converting them into invoices.
9. Do not allow historical invoices to change when customer/business information changes.
10. Do not build Phase 2 features before Phase 1 is stable.
11. Do not implement `status` as a Prisma-level enum; validate it in `lib/documents/status.ts` against the type-specific allowed set.
12. Do not set `status = "sent"` from anywhere except `POST /api/documents/:id/send`.
13. Do not set `status = "viewed"` from anywhere except the public share-link route.
14. Do not introduce a second database or storage vendor beyond Supabase.

Before each major phase:

1. Inspect the current code.
2. Identify what already exists.
3. Implement the smallest coherent change.
4. Run type checking.
5. Run linting.
6. Run tests.
7. Fix errors.
8. Summarize what changed.
9. Proceed to the next phase.

At the end of each phase, provide:

* Files created/modified
* Database changes
* API changes
* UI changes
* Tests added
* Remaining work
* Any architectural concerns

Do not rewrite working code unnecessarily.

Prioritize correctness, maintainability, tenant isolation and a polished user experience over speed of implementation.
