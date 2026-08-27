// India-only app — every "today"/"this year" the app computes must reflect
// the IST calendar day, not the server process's runtime timezone (UTC in
// most deployments) or a browser's local timezone. A naive `new Date()` /
// `.getFullYear()` / `.toISOString()` calculation is fine for a fixed
// instant, but wrong for "what calendar date is it right now for a
// business in India": during 00:00-05:29 IST, UTC is still on the
// previous calendar day, so a UTC-based "today" lands one day early.
const IST_TIME_ZONE = "Asia/Kolkata";

// "en-CA" formats as YYYY-MM-DD, which is exactly the string
// `new Date(...)` needs to parse back as UTC midnight of that date — the
// same convention the date-input round trip already relies on (see
// toDateInputValue in components/documents/document-builder.tsx).
function istDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// A Date representing UTC-midnight of today's IST calendar date. Used
// anywhere a date-only field (issueDate, etc.) is defaulted to "today".
export function todayInIST(): Date {
  return new Date(`${istDateString(new Date())}T00:00:00.000Z`);
}

// The calendar year in IST for a given instant (defaults to now) — used
// for document numbering, which resets per year.
export function getISTYear(date: Date = new Date()): number {
  return Number(istDateString(date).slice(0, 4));
}

// Formats a date-only value for display, always in the IST calendar day —
// never the server's or the viewer's local timezone. Without an explicit
// `timeZone`, `toLocaleDateString` falls back to the runtime's local zone,
// which is wrong for these fields regardless of where the app is deployed
// or who's viewing it (see todayInIST above for why that matters).
export function formatDateIST(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    ...options,
  }).format(typeof date === "string" ? new Date(date) : date);
}
