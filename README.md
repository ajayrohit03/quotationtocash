# QuotationToCash

Multi-tenant quotation and invoice SaaS for small businesses in India, built with GST
(CGST/SGST/IGST) rules in mind. See [`InvoiceFlow-spec.md`](./InvoiceFlow-spec.md) and
[`InvoiceFlow-build-prompt-final.md`](./InvoiceFlow-build-prompt-final.md) for the full
product spec and implementation plan.

## Stack

Next.js (App Router) + TypeScript, Tailwind CSS + shadcn/ui, Prisma against Supabase
Postgres, Supabase Storage, Clerk auth, Resend for email, react-pdf for PDF export.

## Getting started

1. Copy `.env.example` to `.env` and fill in real Supabase, Clerk, and Resend
   credentials.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Apply the checked-in migrations to your Supabase database:

   ```bash
   npx prisma migrate deploy
   ```

   (Use `npx prisma migrate dev` instead once you start changing
   `schema.prisma` yourself — it diffs against the database and writes a new
   migration file.)

4. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Roles & permissions

Each business member has a `role` — `owner`, `admin`, or `staff` — plus an optional
position in a manager/report hierarchy (`reportsToId` on `BusinessMember`). Owner and
Admin see every document unconditionally; Staff visibility is scoped by hierarchy
(themselves and, if they have direct reports, their reports' documents too — see
[`docs/hierarchy-access-control-design.md`](./docs/hierarchy-access-control-design.md)).
"Manager" is never a stored role — it's derived live from whether a member has active
direct reports (`lib/auth/permissions.ts`).

Permission (what a member can do) and scope (which records they can see) are
independent axes — see [`docs/permission-layer-design.md`](./docs/permission-layer-design.md).
Route handlers call `requirePermission()` / `requireBusinessAdmin()` /
`requireBusinessOwner()` from `lib/auth/` to enforce both.

New members join by accepting an emailed invitation (never by "add member by email")
— see [`docs/invitation-onboarding-design.md`](./docs/invitation-onboarding-design.md)
for the token/expiry/rate-limit design.

## Public document sharing

Sent documents can be shared via a public, unauthenticated link scoped to the
business's own subdomain (`{business-slug}.{apex domain}/public/documents/{token}`).
See [`docs/public-share-subdomains-design.md`](./docs/public-share-subdomains-design.md)
for the slug generation/collision handling and why the subdomain isn't resolved in
middleware.

## Project structure

```text
app/            routes: (auth), (app) [dashboard, quotations, invoices, customers,
                products, settings], onboarding, invitations, invite/[token],
                public/documents/[token], api
components/     ui (shadcn), layout, dashboard, documents, customers, products, settings
lib/            auth, business (hierarchy/slug/subdomain), db, tax, documents,
                invitations, pdf, email, rate-limit, validation, storage, env
prisma/         schema.prisma, migrations
docs/           design docs for hierarchy/permissions/invitations/public sharing
```

Business logic (tax calculations, authorization, document calculations) lives in
`lib/`, not inside React components. Every tenant-owned query must be scoped by
`businessId`; use `requireAuth()` / `requireBusiness()` / `requireBusinessOwner()` /
`requireBusinessAdmin()` / `requirePermission()` from `lib/auth/session.ts` and
`lib/auth/permissions.ts` (or the redirect-on-failure `*ForPage()` variants in
`lib/auth/page.ts`) to get it — see [`lib/auth/`](./lib/auth).
