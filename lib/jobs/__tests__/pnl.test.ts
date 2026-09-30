import { describe, expect, it } from "vitest";
import { groupJobPnlByCurrency } from "@/lib/jobs/pnl";

describe("groupJobPnlByCurrency", () => {
  it("renders one row for the common single-currency case", () => {
    const groups = groupJobPnlByCurrency(
      [{ total: 10000, currency: "INR" }],
      [{ total: 6000, currency: "INR" }],
    );
    expect(groups).toEqual([
      { currency: "INR", billed: 10000, cost: 6000, margin: 4000, marginPct: 40 },
    ]);
  });

  it("never blends currencies — one row per currency present, no conversion", () => {
    const groups = groupJobPnlByCurrency(
      [{ total: 10000, currency: "INR" }],
      [{ total: 500, currency: "USD" }],
    );
    expect(groups).toHaveLength(2);
    const inr = groups.find((g) => g.currency === "INR")!;
    const usd = groups.find((g) => g.currency === "USD")!;
    expect(inr).toEqual({ currency: "INR", billed: 10000, cost: 0, margin: 10000, marginPct: 100 });
    expect(usd).toEqual({ currency: "USD", billed: 0, cost: 500, margin: -500, marginPct: null });
  });

  it("sums multiple lines in the same currency", () => {
    const groups = groupJobPnlByCurrency(
      [
        { total: 5000, currency: "INR" },
        { total: 3000, currency: "INR" },
      ],
      [{ total: 2000, currency: "INR" }],
    );
    expect(groups).toEqual([
      { currency: "INR", billed: 8000, cost: 2000, margin: 6000, marginPct: 75 },
    ]);
  });

  it("returns marginPct null when billed is 0 — cost incurred before billing catches up", () => {
    const groups = groupJobPnlByCurrency([], [{ total: 1000, currency: "INR" }]);
    expect(groups[0]!.marginPct).toBeNull();
  });

  it("returns an empty array for a job with nothing linked", () => {
    expect(groupJobPnlByCurrency([], [])).toEqual([]);
  });
});
