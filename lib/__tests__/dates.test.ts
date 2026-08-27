import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDateIST, getISTYear, todayInIST } from "@/lib/dates";

// The bug this guards against: it's tempting to compute "today"/"this
// year" with `new Date()` + `.getFullYear()` / `.toISOString()`, which
// read the server/browser's own timezone (often UTC) rather than IST.
// During 00:00-05:29 IST, UTC is still on the previous calendar day, so a
// naive UTC-based "today" lands one day early for a business in India —
// exactly what was reported: a document created on the 18th (IST)
// defaulted to the 17th. These tests pin the system clock to that exact
// boundary window rather than just asserting "a date came back".
describe("IST date helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("todayInIST", () => {
    it("stays on the IST calendar day even when UTC is still 'yesterday'", () => {
      // 2026-08-17T20:00:00Z = 2026-08-18T01:30 IST — after midnight in
      // India, but still the 17th in UTC.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-17T20:00:00.000Z"));

      const result = todayInIST();
      expect(result.toISOString().slice(0, 10)).toBe("2026-08-18");
    });

    it("matches UTC when the two calendars agree (midday IST)", () => {
      // 2026-08-18T10:00:00Z = 2026-08-18T15:30 IST — both calendars
      // already agree it's the 18th; this is the non-edge-case control.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-18T10:00:00.000Z"));

      const result = todayInIST();
      expect(result.toISOString().slice(0, 10)).toBe("2026-08-18");
    });

    it("does not roll back a day even right at the UTC/IST boundary", () => {
      // 2026-08-17T18:31:00Z = 2026-08-18T00:01 IST — one minute past
      // midnight in India, 89 minutes before UTC midnight.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-17T18:31:00.000Z"));

      expect(todayInIST().toISOString().slice(0, 10)).toBe("2026-08-18");
    });
  });

  describe("getISTYear", () => {
    it("rolls over to the new year at IST midnight, not UTC midnight", () => {
      // 2025-12-31T19:00:00Z = 2026-01-01T00:30 IST.
      const instant = new Date("2025-12-31T19:00:00.000Z");
      expect(getISTYear(instant)).toBe(2026);
    });

    it("stays on the old year while UTC and IST still agree", () => {
      // 2025-12-31T10:00:00Z = 2025-12-31T15:30 IST.
      const instant = new Date("2025-12-31T10:00:00.000Z");
      expect(getISTYear(instant)).toBe(2025);
    });
  });

  describe("formatDateIST", () => {
    it("renders the IST calendar date regardless of the runtime's local timezone", () => {
      // Same boundary instant as above: UTC says the 17th, IST says the 18th.
      const instant = new Date("2026-08-17T20:00:00.000Z");
      const formatted = formatDateIST(instant, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      expect(formatted).toBe("18 Aug 2026");
    });

    it("accepts an ISO string the same way it accepts a Date", () => {
      const formatted = formatDateIST("2026-08-17T20:00:00.000Z", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      expect(formatted).toBe("18 Aug 2026");
    });
  });

  describe("round trip with the date-input convention", () => {
    // Mirrors toDateInputValue in components/documents/document-builder.tsx:
    // a UTC-midnight Date's ISO date prefix must equal the IST calendar
    // date it represents, or the builder's <input type="date"> would show
    // the wrong day the moment it reads a todayInIST() default back.
    it("todayInIST() output survives the toDateInputValue-style round trip", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-17T20:00:00.000Z"));

      const stored = todayInIST();
      const inputValue = stored.toISOString().slice(0, 10);
      expect(inputValue).toBe("2026-08-18");
    });
  });
});
