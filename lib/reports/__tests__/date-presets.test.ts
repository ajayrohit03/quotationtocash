import { describe, expect, it } from "vitest";
import { resolvePreset } from "../date-presets";

describe("resolvePreset", () => {
  // 2026-10-09 is a Friday.
  const today = "2026-10-09";

  it("this week runs Monday to today", () => {
    expect(resolvePreset("week", today)).toEqual({ from: "2026-10-05", to: today });
  });

  it("this week on a Monday is just today, and on a Sunday reaches back six days", () => {
    expect(resolvePreset("week", "2026-10-05")).toEqual({ from: "2026-10-05", to: "2026-10-05" });
    expect(resolvePreset("week", "2026-10-11")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
  });

  it("this week crosses a month and year boundary", () => {
    expect(resolvePreset("week", "2026-01-01")).toEqual({ from: "2025-12-29", to: "2026-01-01" });
  });

  it("this month and this year start on the 1st / Jan 1", () => {
    expect(resolvePreset("month", today)).toEqual({ from: "2026-10-01", to: today });
    expect(resolvePreset("year", today)).toEqual({ from: "2026-01-01", to: today });
  });

  it("last 3 / 6 months is the same day-of-month that many months back", () => {
    expect(resolvePreset("3months", today)).toEqual({ from: "2026-07-09", to: today });
    expect(resolvePreset("6months", today)).toEqual({ from: "2026-04-09", to: today });
    expect(resolvePreset("6months", "2026-03-15")).toEqual({ from: "2025-09-15", to: "2026-03-15" });
  });

  it("clamps to the end of a shorter month", () => {
    expect(resolvePreset("3months", "2026-05-31")).toEqual({ from: "2026-02-28", to: "2026-05-31" });
    expect(resolvePreset("3months", "2028-05-31")).toEqual({ from: "2028-02-29", to: "2028-05-31" });
  });
});
