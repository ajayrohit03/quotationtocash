// Zero imports on purpose — this file and feature-enabled.ts must stay
// usable from anywhere (app, admin route group, tests). See
// docs/feature-flags-and-plans-design.md. Nothing here is enforced in the
// UI/API yet; it only describes the intended tiers.
export const PLANS = ["free", "starter", "growth", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

const F = false;
const T = true;

// Column order: free, starter, growth, enterprise.
const row = (free: boolean, starter: boolean, growth: boolean, enterprise: boolean) => ({
  free,
  starter,
  growth,
  enterprise,
});

const FEATURE_ROWS = {
  quotations: row(T, T, T, T),
  // TODO(enforcement): free plan is capped at PLAN_LIMITS["invoices.per_month"]
  // (10). Not counted or enforced anywhere yet; this flag (or an override)
  // is what will lift the cap.
  "invoices.unlimited": row(F, T, T, T),
  proforma: row(F, T, T, T),
  "custom_fields.document": row(F, T, T, T),
  "custom_fields.line_item": row(F, F, T, T),
  // Includes LUT export — same toggle as billing in a foreign currency.
  multi_currency: row(F, F, T, T),
  purchase_invoices: row(F, F, T, T),
  vendors: row(F, F, T, T),
  jobs_pnl: row(F, F, T, T),
  "layouts.all_five": row(F, F, T, T),
  // Lifts the member cap (PLAN_LIMITS["team.max_members"]) entirely.
  "team.extended": row(F, F, F, T),
  "team.hierarchy": row(F, F, T, T),
  "documents.branding": row(F, T, T, T),
  einvoicing: row(F, F, F, T),
} as const;

export type FeatureKey = keyof typeof FEATURE_ROWS;

export const FEATURE_KEYS = Object.keys(FEATURE_ROWS) as FeatureKey[];

export const PLAN_FEATURES: Record<Plan, Record<FeatureKey, boolean>> = {
  free: {} as Record<FeatureKey, boolean>,
  starter: {} as Record<FeatureKey, boolean>,
  growth: {} as Record<FeatureKey, boolean>,
  enterprise: {} as Record<FeatureKey, boolean>,
};
for (const key of FEATURE_KEYS) {
  for (const plan of PLANS) {
    PLAN_FEATURES[plan][key] = FEATURE_ROWS[key][plan];
  }
}

// Quantities, not switches — deliberately NOT overridable through
// Business.planOverrides (Record<string, boolean>). A boolean override
// ("team.extended", "invoices.unlimited") lifts the cap entirely. null =
// unlimited. Read by nothing yet.
export const PLAN_LIMITS = {
  free: { "team.max_members": 1, "invoices.per_month": 10 },
  starter: { "team.max_members": 3, "invoices.per_month": null },
  growth: { "team.max_members": 5, "invoices.per_month": null },
  enterprise: { "team.max_members": null, "invoices.per_month": null },
} as const satisfies Record<Plan, Record<string, number | null>>;

// Document layouts each plan may choose. growth+ is all five (also what a
// true "layouts.all_five" override grants). NOTE: Business.documentTemplate
// currently defaults to "classic", which free does not include — resolve
// that (migrate default / grandfather) before enforcing this.
export const PLAN_LAYOUTS = {
  free: ["modern"],
  starter: ["classic", "modern", "minimal"],
  growth: ["classic", "modern", "minimal", "compact", "formal"],
  enterprise: ["classic", "modern", "minimal", "compact", "formal"],
} as const satisfies Record<Plan, readonly string[]>;
