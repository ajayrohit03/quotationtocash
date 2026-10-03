import { describe, expect, it } from "vitest";
import { bucketByMonth, monthsWindowStart, percent, windowStart } from "../months";

describe("bucketByMonth", () => {
  const now = new Date("2026-10-15T06:00:00Z");

  it("returns six zero-filled months, oldest first, current one partial", () => {
    const buckets = bucketByMonth([], now);
    expect(buckets.map((b) => b.key)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(buckets.map((b) => b.label)).toEqual(["May 26", "Jun 26", "Jul 26", "Aug 26", "Sep 26", "Oct 26"]);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
    expect(buckets.map((b) => b.partial)).toEqual([false, false, false, false, false, true]);
  });

  it("rolls over the year boundary", () => {
    const buckets = bucketByMonth([], new Date("2026-02-10T00:00:00Z"));
    expect(buckets.map((b) => b.key)).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("buckets by the IST calendar month, not UTC", () => {
    // 2026-09-30 19:00 UTC = 2026-10-01 00:30 IST -> October
    // 2026-09-30 18:00 UTC = 2026-09-30 23:30 IST -> September
    const buckets = bucketByMonth(
      [new Date("2026-09-30T19:00:00Z"), new Date("2026-09-30T18:00:00Z")],
      now,
    );
    expect(buckets.find((b) => b.key === "2026-10")?.count).toBe(1);
    expect(buckets.find((b) => b.key === "2026-09")?.count).toBe(1);
  });

  it("ignores dates outside the window and counts several in one month", () => {
    const buckets = bucketByMonth(
      [new Date("2026-04-30T18:00:00Z"), new Date("2026-08-02T00:00:00Z"), new Date("2026-08-20T00:00:00Z")],
      now,
    );
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(2);
    expect(buckets.find((b) => b.key === "2026-08")?.count).toBe(2);
  });
});

describe("window helpers", () => {
  it("monthsWindowStart is the first instant of the oldest bucket's IST month", () => {
    // May 1 2026 00:00 IST = Apr 30 18:30 UTC
    expect(monthsWindowStart(new Date("2026-10-15T06:00:00Z"), 6).toISOString()).toBe("2026-04-30T18:30:00.000Z");
  });

  it("windowStart is exactly N days back", () => {
    const now = new Date("2026-10-15T06:00:00Z");
    expect(windowStart(now, 30).toISOString()).toBe("2026-09-15T06:00:00.000Z");
  });
});

describe("percent", () => {
  it("rounds, and is null when there is nothing to divide by", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 5)).toBe(0);
    expect(percent(0, 0)).toBeNull();
  });
});
