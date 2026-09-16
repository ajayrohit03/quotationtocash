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
});
