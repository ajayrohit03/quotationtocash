# InvoiceFlow

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

3. Push the Prisma schema to your Supabase database:

   ```bash
   npx prisma migrate dev
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Project structure

```text
app/            routes: (auth), dashboard, quotations, invoices, customers,
                products, settings, api, public/documents/[token]
components/     ui (shadcn), dashboard, documents, customers, products, settings
lib/            auth, db, tax, documents, pdf, email, validation, storage, env
prisma/         schema.prisma, migrations
```

Business logic (tax calculations, authorization, document calculations) lives in
`lib/`, not inside React components. Every tenant-owned query is scoped by
`businessId` — see `lib/auth/` once Phase 2 lands.
