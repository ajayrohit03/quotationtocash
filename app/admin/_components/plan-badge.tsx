import type { Plan } from "@/lib/plans/catalog";

const STYLES: Record<Plan, string> = {
  free: "bg-slate-500/20 text-slate-300",
  starter: "bg-blue-500/20 text-blue-300",
  growth: "bg-emerald-500/20 text-emerald-300",
  enterprise: "bg-purple-500/20 text-purple-300",
};

export function PlanBadge({ plan }: { plan: Plan }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STYLES[plan]}`}>
      {plan}
    </span>
  );
}
