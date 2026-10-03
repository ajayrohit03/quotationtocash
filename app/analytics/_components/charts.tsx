import type { MonthBucket } from "@/lib/analytics/months";

// Server-rendered SVG only — no chart dependency, no client JS.
export function SignupsChart({ buckets }: { buckets: MonthBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const slot = 300 / buckets.length;
  const barW = slot * 0.55;
  const chartH = 90;
  const summary = buckets.map((b) => `${b.label}: ${b.count}`).join(", ");
  return (
    <svg viewBox="0 0 300 130" role="img" aria-label={`New signups per month. ${summary}`} className="w-full">
      {buckets.map((b, i) => {
        const h = b.count === 0 ? 1 : Math.max(3, (b.count / max) * chartH);
        const x = i * slot + (slot - barW) / 2;
        return (
          <g key={b.key}>
            <rect
              x={x}
              y={20 + chartH - h}
              width={barW}
              height={h}
              rx={2}
              className={b.partial ? "fill-brand-green/50" : "fill-brand-green"}
            />
            <text x={x + barW / 2} y={16 + chartH - h} textAnchor="middle" className="fill-slate-200 text-[10px]">
              {b.count}
            </text>
            <text x={x + barW / 2} y={125} textAnchor="middle" className="fill-slate-400 text-[9px]">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function MeterBar({ value, total, className }: { value: number; total: number; className: string }) {
  const pct = total === 0 ? 0 : (value / total) * 100;
  return (
    <svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden className="h-1.5 w-full">
      <rect width="100" height="6" rx="3" className="fill-white/10" />
      {pct > 0 && <rect width={Math.max(pct, 2)} height="6" rx="3" className={className} />}
    </svg>
  );
}
