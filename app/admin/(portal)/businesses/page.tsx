import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin/auth";
import { listBusinessesWithStats } from "@/lib/admin/queries";
import { formatDateIST } from "@/lib/dates";
import { PlanBadge } from "../../_components/plan-badge";

export default async function AdminBusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  if (!(await isAdminSession())) redirect("/login");
  const { q } = await searchParams;
  const businesses = await listBusinessesWithStats(q);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold">
          Businesses <span className="text-sm font-normal text-slate-400">({businesses.length})</span>
        </h1>
        <form action="/businesses" className="flex gap-2">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name"
            aria-label="Search by name"
            className="w-56 rounded-lg border border-white/15 bg-navy-mid px-3 py-1.5 text-sm outline-none focus:border-brand-green"
          />
          <button className="rounded-lg bg-navy-light px-3 py-1.5 text-sm">Search</button>
        </form>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy-mid text-xs text-slate-400 uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Plan</th>
              <th className="px-4 py-2 font-medium">Signed up</th>
              <th className="px-4 py-2 text-right font-medium">Invoices</th>
              <th className="px-4 py-2 font-medium" title="Latest edit to any document or purchase invoice">
                Last active
              </th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((b) => (
              <tr key={b.id} className="relative cursor-pointer border-t border-white/5 hover:bg-navy-light/50">
                <td className="px-4 py-2">
                  {/* Stretched link: the ::after covers the whole row (tr is relative),
                      so the entire row is clickable while staying a real link. */}
                  <Link
                    href={`/businesses/${b.id}`}
                    className="font-medium after:absolute after:inset-0 hover:text-brand-green"
                  >
                    {b.name}
                  </Link>
                  {b.isInternal && (
                    <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300 uppercase">
                      internal
                    </span>
                  )}
                  <div className="text-xs text-slate-500">{b.email}</div>
                </td>
                <td className="px-4 py-2">
                  <PlanBadge plan={b.plan} />
                </td>
                <td className="px-4 py-2 text-slate-300">{formatDateIST(b.createdAt)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{b.stats.invoices}</td>
                <td className="px-4 py-2 text-slate-300">
                  {b.stats.lastActiveAt ? formatDateIST(b.stats.lastActiveAt) : "—"}
                </td>
              </tr>
            ))}
            {businesses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No businesses found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
