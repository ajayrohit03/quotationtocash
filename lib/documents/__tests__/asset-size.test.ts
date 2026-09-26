import { describe, expect, it } from "vitest";
import { ASSET_SIZE_SCALE } from "@/lib/documents/asset-size";

describe("ASSET_SIZE_SCALE", () => {
  it("is a no-op at md — the existing baseline both renderers used before this feature", () => {
    expect(ASSET_SIZE_SCALE.md).toBe(1);
  });

  it("matches the spec's exact percentages relative to md", () => {
    expect(ASSET_SIZE_SCALE.sm).toBeCloseTo(0.75, 5);
    expect(ASSET_SIZE_SCALE.lg).toBeCloseTo(1.333, 3);
    expect(ASSET_SIZE_SCALE.xl).toBeCloseTo(1.75, 5);
  });

  it("is strictly increasing sm < md < lg < xl", () => {
    expect(ASSET_SIZE_SCALE.sm).toBeLessThan(ASSET_SIZE_SCALE.md);
    expect(ASSET_SIZE_SCALE.md).toBeLessThan(ASSET_SIZE_SCALE.lg);
    expect(ASSET_SIZE_SCALE.lg).toBeLessThan(ASSET_SIZE_SCALE.xl);
  });
});
