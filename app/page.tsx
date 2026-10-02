import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Show } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "QuotationToCash — GST-ready invoicing for every Indian business",
  description:
    "Quotations, invoices, payment tracking, purchase invoices and per-job margin — GST-ready from day one.",
};

const NAV = [
  { label: "Features", href: "#features" },
  { label: "Industries", href: "#industries" },
  { label: "GST", href: "#gst" },
  { label: "Pricing", href: "#pricing" },
];

const INDUSTRY_BADGES = [
  "🚢 Freight & Logistics",
  "💼 Consulting",
  "🏭 Manufacturing",
  "🛒 Trading",
  "⚙️ Engineering Services",
  "🏗️ Construction",
];

const FEATURES = [
  ["Quotations & Invoices", "Build a polished document in about two minutes, then convert a quote to an invoice in one click."],
  ["Proforma Invoices", "Send a proforma ahead of shipment or advance payment and convert it when the order is confirmed."],
  ["Payment Tracking", "Record partial payments against any invoice and see the remaining balance at a glance."],
  ["Bank Details on Every Invoice", "Account, IFSC, UPI and SWIFT print automatically so customers can pay without asking."],
  ["Authorised Signatory", "Upload a signature once and choose its size; it appears on every document you issue."],
  ["Finalize & Lock", "Finalizing locks the numbers and turns your document into a TAX INVOICE."],
  ["5 PDF Layouts", "Pick the layout and accent colour that fit your brand, with logo and font size controls."],
  ["Multi-currency & LUT Export", "Invoice in USD or other currencies with INR equivalents and an LUT declaration for exports."],
  ["Custom Fields", "Add your own header and line-item fields from Settings, with no code needed."],
] as const;

const INDUSTRIES = [
  ["Freight & Logistics", "Vessel / Voyage, ports, MBL / HBL, SAC codes and foreign-currency rates per line."],
  ["Consulting & Services", "Project codes, retainer billing and custom reference fields."],
  ["Manufacturing & Trade", "HSN codes, mixed GST rates and an automatic CGST / SGST split."],
  ["Any Business", "Settings → Custom fields. Shape your invoice around your business, no code needed."],
] as const;

const AP_STEPS = [
  ["Add vendors", "Keep supplier details, GSTIN and bank info in one place."],
  ["Record purchase invoices", "Capture what you owe, with partial payments and approval."],
  ["Create a Job", "Group sales and purchase invoices under one shipment or project."],
  ["See your margin", "Revenue minus cost, per job, without a spreadsheet."],
] as const;

const AP_CARDS = [
  ["Vendor Management", "Suppliers, GSTINs and payment details."],
  ["Partial Payments", "Track each payment and the balance still due."],
  ["Approval Workflow", "Approve purchase invoices before they count."],
  ["Per-job Margin", "Know which jobs actually make money."],
] as const;

const GST_ITEMS = [
  "IGST vs CGST / SGST auto-detected",
  "Mixed GST rates on one invoice",
  "GSTIN, PAN, TAN, CIN and SWIFT in the header",
  "LUT export invoices",
  "E-invoicing scaffolding",
  "TAX INVOICE label on finalize",
  "Amount in words, Indian format",
  "Place of Supply on every document",
];

const PLANS = [
  {
    name: "Starter",
    price: "₹0",
    unit: "",
    blurb: "For getting going.",
    items: ["Up to 10 invoices / month", "Quotations & invoices", "GST-ready PDFs"],
    cta: "Start free",
    href: "/sign-up",
    featured: false,
  },
  {
    name: "Growth",
    price: "₹999",
    unit: "/mo",
    blurb: "Most popular",
    items: [
      "Unlimited invoices",
      "Accounts payable & Job P&L",
      "5 team members",
      "Custom fields",
      "Multi-currency",
      "All 5 layouts",
    ],
    cta: "Start 14-day free trial",
    href: "/sign-up",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    unit: "",
    blurb: "For larger teams.",
    items: ["Everything in Growth", "E-invoicing", "Dedicated support"],
    cta: "Talk to us",
    href: "mailto:support@quotationtocash.com",
    featured: false,
  },
] as const;

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-brand-green px-5 py-3 text-sm font-semibold text-navy transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green";
const btnGhost =
  "inline-flex items-center justify-center rounded-lg border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const eyebrow = "text-xs font-semibold tracking-widest text-brand-green uppercase";
const h2 =
  "font-display mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl";

function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/Q2Clogo.png"
      alt="QuotationToCash"
      width={1774}
      height={887}
      className={className}
    />
  );
}

export default function Home() {
  return (
    <div className="bg-white text-navy">
      {/* 1. Nav */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-navy/85 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            aria-label="QuotationToCash home"
            className="rounded-lg bg-white/95 px-2.5 py-1"
          >
            <Logo className="h-8 w-auto" />
          </Link>
          <ul className="hidden items-center gap-8 md:flex">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} className="text-sm text-white/75 transition hover:text-white">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
          <Show when="signed-out">
            <Link href="/sign-up" className={btnPrimary + " !py-2"}>
              Start free
            </Link>
          </Show>
          <Show when="signed-in">
            <Link href="/dashboard" className={btnPrimary + " !py-2"}>
              Dashboard
            </Link>
          </Show>
        </nav>
      </header>

      <main>
        {/* 2. Hero */}
        <section className="relative overflow-hidden bg-navy pt-16 text-white">
          <div className="pointer-events-none absolute -top-24 right-0 h-[32rem] w-[32rem] rounded-full bg-[radial-gradient(circle,rgba(0,184,122,0.28),transparent_65%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
            <div>
              <span className="inline-block rounded-full border border-brand-green/40 bg-brand-green/10 px-3 py-1 text-xs font-medium text-brand-green">
                Built for every Indian business
              </span>
              <h1 className="font-display mt-5 text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl lg:text-[60px]">
                Professional invoicing, GST-ready from day one
              </h1>
              <p className="mt-5 max-w-xl text-lg text-white/70">
                Whether you run a consulting practice, a freight forwarding
                desk, a factory or a shop, QuotationToCash adapts to the way
                your business invoices.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/sign-up" className={btnPrimary}>
                  Create your first invoice
                </Link>
                <Link href="/sign-in" className={btnGhost}>
                  Sign in
                </Link>
              </div>
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
                {[
                  ["2 min", "To your first invoice"],
                  ["GST", "Fully compliant"],
                  ["₹ USD", "Multi-currency"],
                ].map(([v, l]) => (
                  <div key={v}>
                    <dt className="font-display text-xl font-bold text-brand-green">{v}</dt>
                    <dd className="mt-0.5 text-xs text-white/60">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="relative mx-auto w-full max-w-md py-8">
              <div className="rounded-3xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-center rounded-2xl bg-white px-6 py-4">
                  <Logo className="h-auto w-full" />
                </div>
              </div>
              <div className="animate-float absolute -top-2 -left-2 rounded-xl bg-white px-4 py-3 text-navy shadow-xl sm:-left-8">
                <p className="text-xs text-navy/60">INV-2026-0009 paid</p>
                <p className="font-display text-lg font-bold text-brand-green">₹2,32,114</p>
              </div>
              <div className="animate-float absolute -right-2 -bottom-2 rounded-xl bg-white px-4 py-3 text-navy shadow-xl [animation-delay:1.5s] sm:-right-8">
                <p className="text-xs text-navy/60">Job margin</p>
                <p className="font-display text-lg font-bold">visible</p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Industry strip */}
        <section className="bg-slate-100 py-10">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
            <p className="text-xs font-semibold tracking-widest text-navy/50">
              USED BY BUSINESSES ACROSS INDUSTRIES
            </p>
            <ul className="mt-5 flex flex-wrap justify-center gap-3">
              {INDUSTRY_BADGES.map((b) => (
                <li key={b} className="rounded-full bg-white px-4 py-2 text-sm font-medium shadow-sm">
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 4. Features */}
        <section id="features" className="scroll-mt-16 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className={eyebrow}>Features</p>
            <h2 className={h2 + " max-w-2xl"}>
              From first quote to final payment — every step covered.
            </h2>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(([t, d]) => (
                <article key={t} className="rounded-2xl border border-slate-200 p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="h-1 w-8 rounded bg-brand-green" />
                  <h3 className="font-display mt-4 text-lg font-bold">{t}</h3>
                  <p className="mt-2 text-sm text-navy/70">{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 5. Industries */}
        <section id="industries" className="scroll-mt-16 bg-slate-100 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className={eyebrow}>Industries</p>
            <h2 className={h2}>Your invoice fields, not ours.</h2>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {INDUSTRIES.map(([t, d]) => (
                <article key={t} className="rounded-2xl bg-white p-6 shadow-sm">
                  <h3 className="font-display text-lg font-bold">{t}</h3>
                  <p className="mt-2 text-sm text-navy/70">{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 6. AP + Job P&L */}
        <section className="bg-navy py-20 text-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <p className={eyebrow}>Payables & Job P&amp;L</p>
              <h2 className={h2}>Know what each job actually earns.</h2>
              <ol className="mt-8 space-y-5">
                {AP_STEPS.map(([t, d], i) => (
                  <li key={t} className="flex gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-green text-sm font-bold text-navy">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold">{t}</h3>
                      <p className="text-sm text-white/65">{d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="grid content-center gap-4 sm:grid-cols-2">
              {AP_CARDS.map(([t, d]) => (
                <article key={t} className="rounded-2xl border border-white/10 bg-navy-mid p-5">
                  <h3 className="font-display font-bold">{t}</h3>
                  <p className="mt-2 text-sm text-white/65">{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 7. GST */}
        <section id="gst" className="scroll-mt-16 py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <p className={eyebrow}>GST compliance</p>
              <h2 className={h2}>Compliant by default, not by effort.</h2>
              <ul className="mt-8 space-y-3">
                {GST_ITEMS.map((i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-green/15 text-xs font-bold text-brand-green">
                      ✓
                    </span>
                    {i}
                  </li>
                ))}
              </ul>
            </div>
            <div
              aria-label="Sample invoice"
              className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-lg font-bold">TAX INVOICE</p>
                  <p className="text-xs text-navy/50">INV-2026-0009</p>
                </div>
                <p className="text-right text-xs text-navy/50">
                  Place of Supply
                  <br />
                  <span className="font-medium text-navy">Karnataka</span>
                </p>
              </div>
              <table className="mt-5 w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-navy/50">
                    <th className="py-2 font-medium">Item</th>
                    <th className="py-2 font-medium">GST</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-2">Consulting</td>
                    <td>18%</td>
                    <td className="text-right">₹1,00,000</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2">Software licence</td>
                    <td>12%</td>
                    <td className="text-right">₹50,000</td>
                  </tr>
                  <tr>
                    <td className="py-2">CGST / SGST</td>
                    <td>9% + 9%, 6% + 6%</td>
                    <td className="text-right">₹24,000</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-navy px-4 py-3 text-white">
                <span className="text-sm">Grand total</span>
                <span className="font-display text-lg font-bold text-brand-green">₹1,74,000</span>
              </div>
              <p className="mt-2 text-[11px] text-navy/50">
                Rupees One Lakh Seventy-Four Thousand Only
              </p>
            </div>
          </div>
        </section>

        {/* 8. Pricing */}
        <section id="pricing" className="scroll-mt-16 bg-slate-100 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className={eyebrow}>Pricing</p>
            <h2 className={h2}>Simple pricing that grows with you.</h2>
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {PLANS.map((p) => (
                <article
                  key={p.name}
                  className={
                    "flex flex-col rounded-2xl p-7 " +
                    (p.featured ? "bg-navy text-white shadow-2xl lg:-translate-y-2" : "bg-white shadow-sm")
                  }
                >
                  <h3 className="font-display text-lg font-bold">{p.name}</h3>
                  <p className={"mt-1 text-sm " + (p.featured ? "text-brand-green" : "text-navy/60")}>
                    {p.blurb}
                  </p>
                  <p className="font-display mt-5 text-4xl font-bold">
                    {p.price}
                    <span className="text-base font-medium opacity-60">{p.unit}</span>
                  </p>
                  <ul className="mt-6 flex-1 space-y-2 text-sm">
                    {p.items.map((i) => (
                      <li key={i} className="flex gap-2">
                        <span aria-hidden className="text-brand-green">✓</span>
                        {i}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={p.href}
                    className={
                      "mt-7 " +
                      (p.featured
                        ? btnPrimary
                        : "inline-flex items-center justify-center rounded-lg border border-navy/20 px-5 py-3 text-sm font-semibold transition hover:bg-navy/5")
                    }
                  >
                    {p.cta}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 9. CTA */}
        <section className="bg-navy px-4 py-20 text-center text-white sm:px-6">
          <h2 className="font-display mx-auto max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Your first invoice in under two minutes.
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-3 text-sm font-semibold text-navy transition hover:bg-white/90"
            >
              Create your account
            </Link>
            <a href="mailto:support@quotationtocash.com" className={btnGhost}>
              Talk to us
            </a>
          </div>
        </section>
      </main>

      {/* 10. Footer */}
      <footer className="bg-navy-mid text-white/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:px-6 md:flex-row">
          <span className="rounded-lg bg-white/95 px-2.5 py-1">
            <Logo className="h-8 w-auto" />
          </span>
          <ul className="flex flex-wrap justify-center gap-6 text-sm">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} className="hover:text-white">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs">© 2026 QuotationToCash. Built for Indian businesses.</p>
        </div>
      </footer>
    </div>
  );
}
