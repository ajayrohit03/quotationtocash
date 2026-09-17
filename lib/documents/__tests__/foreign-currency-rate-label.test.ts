import { describe, expect, it } from "vitest";
import { resolveForeignCurrencyRateLabel } from "@/lib/documents/line-item-columns";

describe("resolveForeignCurrencyRateLabel", () => {
  it("returns null when no line item has a foreignCurrency", () => {
    expect(
      resolveForeignCurrencyRateLabel([{ foreignCurrency: null }, { foreignCurrency: null }]),
    ).toBeNull();
    expect(resolveForeignCurrencyRateLabel([])).toBeNull();
  });

  it("returns '<CODE> Rate' when exactly one currency is in use", () => {
    expect(
      resolveForeignCurrencyRateLabel([
        { foreignCurrency: "USD" },
        { foreignCurrency: null },
        { foreignCurrency: "USD" },
      ]),
    ).toBe("USD Rate");
  });

  it("returns the generic 'F.C. Rate' when multiple currencies are in use", () => {
    expect(
      resolveForeignCurrencyRateLabel([
        { foreignCurrency: "USD" },
        { foreignCurrency: "EUR" },
      ]),
    ).toBe("F.C. Rate");
  });

  // Regression: a real production document had foreignRate/exchangeRate
  // saved but foreignCurrency null on the line item (the currency code
  // alone failed to persist on that save) — gating on foreignCurrency
  // only silently suppressed both FX columns even though the numeric
  // data was genuinely there. Must fall back to a generic label instead
  // of null whenever any of the three FX fields is present.
  it("returns the generic 'F.C. Rate' when foreignRate/exchangeRate are set but foreignCurrency is null", () => {
    expect(
      resolveForeignCurrencyRateLabel([
        { foreignCurrency: null, foreignRate: 1400, exchangeRate: 98.3437 },
      ]),
    ).toBe("F.C. Rate");
    expect(
      resolveForeignCurrencyRateLabel([{ foreignCurrency: null, exchangeRate: 98.3437 }]),
    ).toBe("F.C. Rate");
  });

  it("still returns null when foreignRate/exchangeRate are also absent", () => {
    expect(
      resolveForeignCurrencyRateLabel([
        { foreignCurrency: null, foreignRate: null, exchangeRate: null },
      ]),
    ).toBeNull();
  });
});
