// Date-range presets for the Reports page, computed on IST calendar dates
// ("YYYY-MM-DD" strings) so the result doesn't depend on the viewer's
// browser timezone.
export const PRESETS = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "3months", label: "Last 3 months" },
  { id: "6months", label: "Last 6 months" },
  { id: "year", label: "This year" },
] as const;
export type PresetId = (typeof PRESETS)[number]["id"];

const pad = (n: number) => String(n).padStart(2, "0");
const toStr = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function parse(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

// Same day-of-month N months back, clamped to that month's last day
// (31 May - 3 months -> 28/29 Feb).
function monthsBack(today: string, months: number): string {
  const { y, m, d } = parse(today);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return toStr(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(d, lastDay));
}

export function resolvePreset(id: PresetId, today: string): { from: string; to: string } {
  const { y, m, d } = parse(today);
  switch (id) {
    case "week": {
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
      const monday = new Date(Date.UTC(y, m - 1, d - ((dow + 6) % 7)));
      return { from: toStr(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()), to: today };
    }
    case "month":
      return { from: toStr(y, m, 1), to: today };
    case "3months":
      return { from: monthsBack(today, 3), to: today };
    case "6months":
      return { from: monthsBack(today, 6), to: today };
    case "year":
      return { from: toStr(y, 1, 1), to: today };
  }
}
