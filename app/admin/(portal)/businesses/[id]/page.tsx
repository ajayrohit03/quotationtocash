import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin/auth";
import { getBusinessDetail } from "@/lib/admin/queries";
import { formatDateIST } from "@/lib/dates";
import { FEATURE_KEYS } from "@/lib/plans/catalog";
import { isFeatureKey } from "@/lib/plans/feature-enabled";
import { PlanBadge } from "../../../_components/plan-badge";
import { InternalToggle } from "./internal-toggle";
import { PlanEditor } from "./plan-editor";

function parseOverrides(value: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (isFeatureKey(k) && typeof v === "boolean") out[k] = v;
    }
  }
  return out;
}

export default async function AdminBusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAdminSession())) redirect("/login");
  const { id } = await params;
  const business = await getBusinessDetail(id);
  if (!business) notFound();

  const { stats } = business;
  const statItems: [string, number][] = [
    ["Invoices", stats.invoices],
    ["Quotations", stats.quotations],
    ["Proforma invoices", stats.proformas],
    ["Purchase invoices", stats.purchaseInvoices],
    ["Vendors", stats.vendors],
    ["Team members", stats.members],
  ];

  return (
    <>
      <Link href="/businesses" className="text-sm text-slate-400 hover:text-white">
        ← All businesses
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-xl font-bold">{business.name}</h1>
        <PlanBadge plan={business.plan} />
      </div>
      <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2"><dt className="text-slate-400">Email</dt><dd>{business.email}</dd></div>
        <div className="flex gap-2"><dt className="text-slate-400">Signed up</dt><dd>{formatDateIST(business.createdAt)}</dd></div>
        <div className="flex gap-2">
          <dt className="text-slate-400">Plan last changed</dt>
          <dd>{business.planUpdatedAt ? formatDateIST(business.planUpdatedAt) : "never"}</dd>
        </div>
        <div className="flex gap-2"><dt className="text-slate-400">Plan note</dt><dd>{business.planNote || "—"}</dd></div>
      </dl>

      <InternalToggle businessId={business.id} initial={business.isInternal} />

      <h2 className="font-display mt-8 text-sm font-bold tracking-wide text-slate-400 uppercase">Usage</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {statItems.map(([label, n]) => (
          <div key={label} className="rounded-lg border border-white/10 bg-navy-mid p-3">
            <div className="text-xl font-bold tabular-nums">{n}</div>
            <div className="text-xs text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      <h2 className="font-display mt-8 text-sm font-bold tracking-wide text-slate-400 uppercase">Plan &amp; features</h2>
      <PlanEditor
        businessId={business.id}
        initialPlan={business.plan}
        initialNote={business.planNote ?? ""}
        initialOverrides={parseOverrides(business.planOverrides)}
        featureKeys={[...FEATURE_KEYS]}
      />
    </>
  );
}
