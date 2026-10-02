import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FEATURE_KEYS, PLANS, PLAN_FEATURES, type FeatureKey } from "../catalog";
import { featureEnabled, isFeatureKey } from "../feature-enabled";

const EXPECTED: Record<FeatureKey, [boolean, boolean, boolean, boolean]> = {
  quotations: [true, true, true, true],
  "invoices.unlimited": [false, true, true, true],
  proforma: [false, true, true, true],
  "custom_fields.document": [false, true, true, true],
  "custom_fields.line_item": [false, false, true, true],
  multi_currency: [false, false, true, true],
  purchase_invoices: [false, false, true, true],
  vendors: [false, false, true, true],
  jobs_pnl: [false, false, true, true],
  "layouts.all_five": [false, false, true, true],
  "team.extended": [false, false, false, true],
  "team.hierarchy": [false, false, true, true],
  "documents.branding": [false, true, true, true],
  einvoicing: [false, false, false, true],
};

describe("featureEnabled — plan defaults", () => {
  it("covers exactly the catalog's keys", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...FEATURE_KEYS].sort());
  });

  for (const key of FEATURE_KEYS) {
    it(`${key} matches the plan table`, () => {
      PLANS.forEach((plan, i) => {
        expect(featureEnabled({ plan, planOverrides: null }, key)).toBe(EXPECTED[key][i]);
      });
    });
  }
});

describe("featureEnabled — overrides", () => {
  it("true grants a feature the plan lacks", () => {
    expect(featureEnabled({ plan: "free", planOverrides: { jobs_pnl: true } }, "jobs_pnl")).toBe(true);
  });

  it("false revokes a feature the plan has", () => {
    expect(featureEnabled({ plan: "growth", planOverrides: { jobs_pnl: false } }, "jobs_pnl")).toBe(false);
  });

  it("only affects the named feature", () => {
    const b = { plan: "free" as const, planOverrides: { jobs_pnl: true } };
    expect(featureEnabled(b, "vendors")).toBe(false);
  });

  it("ignores non-boolean override values instead of coercing", () => {
    for (const bad of ["true", 1, null, {}, []]) {
      expect(featureEnabled({ plan: "free", planOverrides: { jobs_pnl: bad } }, "jobs_pnl")).toBe(false);
    }
  });

  it("treats null / array / scalar planOverrides as empty", () => {
    for (const bad of [null, undefined, [], "x", 5, true]) {
      expect(featureEnabled({ plan: "growth", planOverrides: bad }, "jobs_pnl")).toBe(true);
    }
  });

  it("does not read inherited prototype keys", () => {
    expect(featureEnabled({ plan: "free", planOverrides: Object.create({ jobs_pnl: true }) }, "jobs_pnl")).toBe(false);
  });

  it("unknown feature is false at runtime", () => {
    expect(featureEnabled({ plan: "enterprise", planOverrides: null }, "nope" as FeatureKey)).toBe(false);
  });
});

describe("isFeatureKey", () => {
  it("accepts catalog keys and rejects everything else", () => {
    expect(isFeatureKey("jobs_pnl")).toBe(true);
    expect(isFeatureKey("constructor")).toBe(false);
    expect(isFeatureKey("__proto__")).toBe(false);
    expect(isFeatureKey("")).toBe(false);
  });
});

describe("catalog / schema consistency", () => {
  it("PLANS equals the Prisma Plan enum", () => {
    const schema = readFileSync(path.join(import.meta.dirname, "../../../prisma/schema.prisma"), "utf8");
    const body = /enum Plan \{([^}]*)\}/.exec(schema)?.[1] ?? "";
    const values = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("@@") && !l.startsWith("//"));
    expect(values).toEqual([...PLANS]);
  });

  it("every plan defines every feature", () => {
    for (const plan of PLANS) {
      expect(Object.keys(PLAN_FEATURES[plan]).sort()).toEqual([...FEATURE_KEYS].sort());
    }
  });
});
