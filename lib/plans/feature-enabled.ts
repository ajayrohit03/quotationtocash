import { FEATURE_KEYS, PLAN_FEATURES, type FeatureKey, type Plan } from "./catalog";

const FEATURE_KEY_SET: ReadonlySet<string> = new Set(FEATURE_KEYS);

export function isFeatureKey(value: string): value is FeatureKey {
  return FEATURE_KEY_SET.has(value);
}

// Override wins when explicitly boolean; otherwise the plan decides.
// Garbage in planOverrides (non-object, non-boolean values) is ignored,
// never coerced — a hand-edited "true" must not silently grant a paid
// feature. Unknown features are false for every plan.
export function featureEnabled(
  business: { plan: Plan; planOverrides: unknown },
  feature: FeatureKey,
): boolean {
  const overrides = business.planOverrides;
  if (typeof overrides === "object" && overrides !== null && !Array.isArray(overrides)) {
    if (Object.hasOwn(overrides, feature)) {
      const value = (overrides as Record<string, unknown>)[feature];
      if (typeof value === "boolean") return value;
    }
  }
  return PLAN_FEATURES[business.plan]?.[feature] ?? false;
}
