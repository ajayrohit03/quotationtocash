import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin/auth";
import { getAnalytics } from "@/lib/analytics/queries";
import { percent } from "@/lib/analytics/months";
import { formatDateIST } from "@/lib/dates";
import type { Plan } from "@/lib/plans/catalog";
import { PlanBadge } from "@/app/admin/_components/plan-badge";
import { MeterBar, SignupsChart } from "../_components/charts";

const PLAN_BAR: Record<Plan, string> = {
  free: "fill-slate-400",
  starter: "fill-blue-400",
  growth: "fill-emerald-400",
  enterprise: "fill-purple-400",
};

const fmt = (n: number) => n.toLocaleString("en-IN");
const pct = (p: number | null) => (p === null ? "—" : `${p}%`);

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-navy-mid p-4">
      <h2 className="font-display mb-3 text-sm font-bold tracking-wide text-slate-400 uppercase">{title}</h2>
      {children}
    </section>
  );
}

export default async function AnalyticsPage() {
  if (!(await isAdminSession())) redirect("/login");
  const data = await getAnalytics();
  const host = (await headers()).get("host") ?? "";
  // Business detail lives on the admin host: app.example.com -> admin.example.com
  const adminOrigin = `${host.startsWith("app.localhost") ? "http" : "https"}://admin.${host.replace(/^app\./, "")}`;

  const total = data.totalBusinesses;
  const overview: [string, number][] = [
    ["Total businesses", data.totalBusinesses],
    ["Active, last 30 days", data.activeBusinesses],
    ["Invoices created (all time)", data.totalInvoices],
    ["Total documents", data.totalDocuments],
  ];
  const adoption: [string, number][] = [
    ["Accounts payable (purchase invoices)", data.adoption.ap],
    ["Jobs", data.adoption.jobs],
    ["Custom fields", data.adoption.customFields],
    ["Multi-currency (non-INR invoices)", data.adoption.multiCurrency],
  ];
  const signupsTotal = data.signupsByMonth.reduce((s, b) => s + b.count, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {overview.map(([label, n]) => (
          <div key={label} className="rounded-lg border border-white/10 bg-navy-mid p-4">
            <div className="text-3xl font-bold tabular-nums">{fmt(n)}</div>
            <div className="mt-1 text-xs text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Plan distribution">
          <ul className="space-y-3">
            {data.planDistribution.map(({ plan, count }) => (
              <li key={plan}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <PlanBadge plan={plan} />
                  <span className="tabular-nums text-slate-300">
                    {fmt(count)} <span className="text-slate-500">· {pct(percent(count, total))}</span>
                  </span>
                </div>
                <MeterBar value={count} total={total} className={PLAN_BAR[plan]} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="New signups per month">
          {signupsTotal === 0 && <p className="mb-2 text-sm text-slate-400">No signups in the last 6 months.</p>}
          <SignupsChart buckets={data.signupsByMonth} />
          <p className="mt-1 text-xs text-slate-500">Current month is still in progress. Months are IST.</p>
        </Card>
      </div>

      <Card title="Feature adoption">
        <ul className="space-y-3">
          {adoption.map(([label, n]) => (
            <li key={label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>{label}</span>
                <span className="tabular-nums text-slate-300">
                  {fmt(n)} of {fmt(total)} <span className="text-slate-500">· {pct(percent(n, total))}</span>
                </span>
              </div>
              <MeterBar value={n} total={total} className="fill-brand-green" />
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Most active (documents created, last 30 days)">
          {data.topBusinesses.length === 0 ? (
            <p className="text-sm text-slate-400">No documents created in the last 30 days.</p>
          ) : (
            <ol className="space-y-2">
              {data.topBusinesses.map((b, i) => (
                <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-4 text-slate-500 tabular-nums">{i + 1}</span>
                    <a href={`${adminOrigin}/businesses/${b.id}`} className="truncate hover:text-brand-green">
                      {b.name}
                    </a>
                    <PlanBadge plan={b.plan} />
                  </span>
                  <span className="tabular-nums text-slate-300">{fmt(b.documents)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Recent signups">
          {data.recentSignups.length === 0 ? (
            <p className="text-sm text-slate-400">No businesses yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.recentSignups.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <a href={`${adminOrigin}/businesses/${b.id}`} className="truncate hover:text-brand-green">
                      {b.name}
                    </a>
                    <PlanBadge plan={b.plan} />
                  </span>
                  <span className="text-slate-400">{formatDateIST(b.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
