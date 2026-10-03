// Pure date bucketing for the analytics dashboard. IST has no DST, so a
// fixed +05:30 offset is exact (matches lib/dates.ts's Asia/Kolkata).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const ACTIVE_WINDOW_DAYS = 30;

export type MonthBucket = {
  key: string; // "2026-10"
  label: string; // "Oct 26"
  count: number;
  partial: boolean; // the current, still-running month
};

function istParts(date: Date): { year: number; month: number } {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() }; // month 0-11
}

// First instant of an IST calendar month, as a UTC Date.
function istMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1) - IST_OFFSET_MS);
}

export function windowStart(now: Date, days = ACTIVE_WINDOW_DAYS): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

// Start of the oldest of the last `months` IST calendar months (current
// month + the previous months-1).
export function monthsWindowStart(now: Date, months = 6): Date {
  const { year, month } = istParts(now);
  return istMonthStart(year, month - (months - 1));
}

// Zero-filled, oldest -> newest.
export function bucketByMonth(dates: Date[], now: Date, months = 6): MonthBucket[] {
  const { year, month } = istParts(now);
  const buckets: MonthBucket[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    buckets.push({
      key: `${y}-${String(m + 1).padStart(2, "0")}`,
      label: `${MONTHS[m]} ${String(y).slice(2)}`,
      count: 0,
      partial: i === 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const date of dates) {
    const p = istParts(date);
    const bucket = byKey.get(`${p.year}-${String(p.month + 1).padStart(2, "0")}`);
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

// null when there is nothing to divide by — the UI shows "—".
export function percent(part: number, total: number): number | null {
  return total === 0 ? null : Math.round((part / total) * 100);
}
