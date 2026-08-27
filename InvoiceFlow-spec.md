# InvoiceFlow — Product & Technical Spec

Source: Claude Design export (`InvoiceFlow_dc.html`). This document translates that
prototype into a buildable SaaS spec for Claude Code.

## 1. Product summary

InvoiceFlow is a multi-tenant invoicing and quotation SaaS for small businesses,
built with Indian GST rules in mind (CGST/SGST/IGST, optional no-GST mode). Each
signup sets up a "business" during onboarding, then manages customers, products,
quotations, and invoices from a dashboard.

## 2. Roles & auth

- **Business (tenant)** — created at signup/onboarding. Owns all data below.
- **User** — belongs to one or more businesses, via a `BusinessMember` row with a role:
  - `owner` — full access, billing, tax settings; can manage members and invite
    admins/staff; exactly one per business
  - `admin` — everything staff can do, plus managing members/invitations and every
    Settings tab except Tax/Billing; sees every document unconditionally
  - `staff` — can create/edit documents, customers, products; cannot change
    business/tax settings, billing, or manage members
- **Manager** — not a stored role. Derived live from whether a staff member has
  active direct reports (`reportsToId` on other members pointing at them). Adds one
  extra permission (`reports.view`); every other manager-vs-staff difference is a
  wider *scope* on a permission staff already has (they can see their reports'
  documents too), not a new permission — see
  [`docs/permission-layer-design.md`](./docs/permission-layer-design.md).
- **Document-visibility hierarchy** — orthogonal to `role`. Owner/Admin see every
  document. Staff see documents they created, plus (if they're a Manager) documents
  created by their direct reports — see
  [`docs/hierarchy-access-control-design.md`](./docs/hierarchy-access-control-design.md).
- New members join by accepting an emailed invitation, never by ad hoc "add by
  email" — see [`docs/invitation-onboarding-design.md`](./docs/invitation-onboarding-design.md).
- Auth provider: Clerk — email/password + Google OAuth at minimum.
- All data queries scoped by `businessId`; no cross-tenant reads.

## 3. Core data model

```
Business
  id, name, slug (unique, auto-generated, powers the public-share subdomain)
  email, phone, address, city, state, country, website, logoUrl
  gstEnabled: boolean
  gstin, gstDefaultRate, placeOfSupply, registrationType   (nullable if gstEnabled=false)
  documentTemplate: enum(classic, modern, minimal)
  accentColor: string
  defaultPaymentTerms, defaultValidityTerms, defaultNotes, defaultTermsText
  onboardingCompletedAt
  createdAt, updatedAt

User
  id, email, name, avatarUrl, authProviderId

BusinessMember
  businessId, userId, role: enum(owner, admin, staff)
  reportsToId (nullable, self-relation — document-visibility hierarchy, see §2)
  title (free text, display-only), isActive (soft-delete for departing members)
  createdAt, updatedAt

Invitation
  id, businessId, email, role: enum(admin, staff)   -- never owner
  title, reportsToId (pre-fills the invitee's hierarchy position)
  tokenHash (SHA-256 of the raw token; raw value never persisted)
  status: enum(pending, accepted, revoked, expired)
  invitedByUserId, acceptedByUserId, expiresAt
  createdAt, updatedAt

Customer
  id, businessId, name, company, email, phone, address, city, state
  createdAt, updatedAt

Product
  id, businessId, name, description, sku, unit (project/month/hour/...), price
  gstRate (nullable if business gstEnabled=false)
  createdAt, updatedAt

Document  (covers both Quotation and Invoice)
  id, businessId, type: enum(quotation, invoice)
  number (e.g. QT-2026-0005 / INV-2026-0008), customerId
  issueDate, dueDate (invoice) / validUntil (quotation)
  paymentTerms / validityTerms
  status: enum(draft, sent, accepted/paid, overdue, declined)  -- differs slightly by type
  subtotal, discountTotal, taxableAmount, cgst, sgst, igst, total, currency
  template, accentColor, showLogo, showGstinRow, showTax, showPayment, showNotes, showTerms
  notes, termsText
  customerSnapshot, businessSnapshot (frozen at creation, never re-derived)
  convertedFromQuotationId (nullable, for quote→invoice conversion)
  shareToken (nullable, public share link), sentAt, viewedAt
  createdByUserId (nullable — document-visibility hierarchy key, never backfilled
  for documents created before the hierarchy feature existed)
  createdAt, updatedAt

LineItem
  id, documentId, productId (nullable — can be a free-text line), name, description
  qty, rate, discountPct, gstRate, amount (computed), sortOrder

DocumentCounter (concurrency-safe per-business/type/year numbering)
  id, businessId, type, year, lastNumber

RateLimitHit (Postgres-backed fixed-window rate limiting — invitations)
  id, bucketKey, windowStart, count

Payment (Phase 2)
  id, invoiceId, amount, method, paidAt
```

## 4. Screens & functionality (from the design)

**Onboarding (4 steps)**
1. Business details (name, email, phone, address, city, state, country, website)
2. Logo upload (optional, skippable)
3. GST setup — toggle GST on/off; if on, capture GSTIN, default rate, place of supply, registration type
4. Document template pick (Classic / Modern / Minimal) — sets default for new documents
- "Skip for now" available at any step; everything editable later in Settings.

**Dashboard**
- Revenue summary cards (e.g. total revenue, trend vs last period)
- Quick actions: create invoice, add customer, add product
- Recent documents table (number, customer, type, date, amount, status, link to open)

**Quotations / Invoices (shared list pattern)**
- Status filter chips, search
- Table: number, customer, date, due/valid date, amount, status pill, row actions (view + type-specific action e.g. "Convert" for quotations, "Mark paid" for invoices)
- Empty state with CTA when no documents exist yet

**Customers**
- List: name, company, email, phone, total invoiced, outstanding balance
- Detail page: contact info, stat cards (total billed, outstanding, document count), document history table, "New quotation" shortcut

**Products & Services**
- List: name, description, SKU, unit, price, GST rate (GST column hidden if business has GST off)

**Document builder** (shared for quotation & invoice, differs by copy/labels)
- Customer picker (existing or "add new customer" inline)
- Document details: number (editable, auto-suggested), issue date, due/valid date, payment/validity terms
- Line items: add/remove rows, qty × rate with optional discount %, computed line amount
- Totals panel: subtotal → discount → taxable amount → CGST/SGST (or IGST if inter-state) → total
  - Tax rows hidden entirely if business has GST off
- Actions: Save draft (autosave), Preview, Download PDF

**Document preview**
- Rendered document per template (Classic/Modern/Minimal)
- Customize sidebar: switch template, accent color swatches, toggle sections on/off (logo, GSTIN row, tax breakdown, payment details, notes, terms) — changes apply live to preview and the exported PDF
- Actions: Save, Download PDF, Share link, Mark as paid (invoice), Convert to invoice (quotation)

**Settings**
- Tabs: Business profile, Tax, Documents (numbering/templates), Appearance, Team, Account
- Business profile/Documents/Appearance mirror onboarding fields, always editable
- Tax tab: Owner only
- Team tab: manage members (role, hierarchy position, deactivate) and pending
  invitations; visible to Owner/Admin

**Invitations & onboarding**
- `/invitations` — a signed-in user's list of pending invitations across businesses
- `/invite/[token]` — accept/decline an invitation via its emailed link
- Accepting creates the `BusinessMember` row (role + hierarchy position from the
  invitation) and, if the invitee has no completed business yet, skips onboarding

## 5. Tax logic (GST)

- If `gstEnabled = false`: no tax fields anywhere in the app or on documents — just a plain total.
- If `gstEnabled = true`:
  - Compare business `placeOfSupply` (state) to the customer's state on each document.
  - **Same state** → split tax into CGST + SGST (each half the GST rate).
  - **Different state** → apply IGST (full rate, single line).
  - Tax rate can be overridden per line item via `Product.gstRate`, falling back to `Business.gstDefaultRate`.

## 6. Stack (finalized)

- **Next.js (App Router) + TypeScript** — unified web + API, mobile-ready backend
- **Supabase Postgres + Prisma** — relational fit for invoices/line items, migrations; single vendor also covers storage
- **Supabase Storage** — business logo uploads
- **Clerk** — multi-user auth with org/team support
- **Resend** — transactional email for document sending (`POST /api/documents/:id/send`)
- **Tailwind CSS + shadcn/ui** — using the design's tokens (Instrument Sans / IBM Plex Mono, `#4F46E5` accent, neutral grays from the export)
- **react-pdf** for PDF generation (move to Puppeteer later if pixel-perfect print output is needed)
- **Vercel** for hosting

## 7. API surface (high-level)

```
POST   /api/business                 create business (onboarding)
GET    /api/business                 current business settings
PATCH  /api/business                 update settings

GET    /api/customers                list
POST   /api/customers                create
GET    /api/customers/:id            detail + documents
PATCH  /api/customers/:id

GET    /api/products                 list
POST   /api/products
PATCH  /api/products/:id

GET    /api/documents?type=invoice|quotation&status=...
POST   /api/documents                create draft
GET    /api/documents/:id
PATCH  /api/documents/:id            edit / autosave
POST   /api/documents/:id/pdf        generate + return PDF
POST   /api/documents/:id/convert    quotation -> invoice
POST   /api/documents/:id/mark-paid
POST   /api/documents/:id/send       email the document via Resend, sets status=sent
POST   /api/documents/:id/share      (re)generate the public share token
POST   /api/documents/:id/reassign   change createdByUserId (hierarchy reassignment)
GET    /public/documents/:token      unauthenticated public view, sets status=viewed

GET    /api/business/members         list members (+ hierarchy)
PATCH  /api/business/members/:id     update role/reportsTo/title/isActive

POST   /api/business/invitations             create + email an invitation
GET    /api/business/invitations              list pending/past invitations
PATCH  /api/business/invitations/:id          revoke
GET    /api/invitations                       current user's own pending invitations
POST   /api/invitations/accept                accept by token
POST   /api/invitations/decline               decline by token
```

`status = "sent"` is only ever set by the send endpoint; downloading a PDF does not change status. `status = "viewed"` is only ever set when the public share link is opened.

## 8. Phased roadmap

- **Phase 1 (MVP) — shipped**: auth, onboarding, business settings, customers, products, quotations, invoices, document builder + preview + PDF export + email sending + public share view, dashboard.
- **Phase 1.5 — shipped**: admin role, member hierarchy (manager/report tree),
  document-visibility scoping by hierarchy, permission layer (`lib/auth/permissions.ts`),
  invitation-based onboarding (replacing ad hoc "add member by email"), public
  share links on business-slug subdomains, Postgres-backed rate limiting.
- **Phase 2**: payments/reminders, quote e-signatures/acceptance.
- **Phase 3**: mobile — Capacitor wrap of the web app first; native rebuild only if needed.

## 9. Resolved decisions

- **Auth**: Clerk.
- **Database + storage**: Supabase Postgres + Supabase Storage (single vendor).
- **Email**: Resend, via a dedicated `POST /api/documents/:id/send` endpoint — "sent" means actually emailed through the app, not just downloaded.
- **`status` field**: stored as `String` in Prisma, validated in application code (`lib/documents/status.ts`) against a type-specific allowed set — not a DB-level enum, since quotations and invoices have different valid statuses.
- **Staff permissions**: resolved via a two-axis model (permission catalog +
  hierarchy-based scope) rather than a fixed owner/staff split — see
  [`docs/permission-layer-design.md`](./docs/permission-layer-design.md) and
  [`docs/hierarchy-access-control-design.md`](./docs/hierarchy-access-control-design.md).
- **Membership**: invitation-only (emailed token, expiring), not ad hoc "add by
  email" — see [`docs/invitation-onboarding-design.md`](./docs/invitation-onboarding-design.md).

## 10. Still open

- Payments/reminders and quote e-signatures (Phase 2) remain undesigned beyond the
  `Payment` table placeholder.
