import type { CustomFieldValueSnapshot } from "@/lib/documents/custom-fields";

// One shared derivation of "which extra columns does the line-items
// table need," used identically by document-render.tsx (web preview +
// public share) and document-pdf.tsx (react-pdf) — see
// docs/custom-fields-and-multicurrency-design.md §4: three separate
// table implementations exist (the builder's own editable <Table>,
// this pair's hand-built layouts) and nothing kept them in sync before
// this. The builder derives its own columns directly from the live
// definitions prop it's given (it's a real <Table>, no layout
// duplication to guard against there, and it needs the live list to
// offer inputs for fields with no value yet) — these two renderers
// instead derive columns from the document's own already-frozen line
// items, same "never re-derive from a live definition" rule as every
// other snapshot in this app: a column here is exactly the set of
// fields some line item on *this* document actually has a value for,
// not whatever's currently active in Settings.
export type LineItemColumn = { id: string; label: string };

export function resolveLineItemColumns(
  lineItems: { customFieldValues: CustomFieldValueSnapshot[] }[],
): LineItemColumn[] {
  const byId = new Map<string, { id: string; label: string; sortOrder: number }>();
  for (const item of lineItems) {
    for (const value of item.customFieldValues) {
      if (!byId.has(value.definitionId)) {
        byId.set(value.definitionId, {
          id: value.definitionId,
          label: value.label,
          sortOrder: value.sortOrder,
        });
      }
    }
  }
  return [...byId.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry) => ({ id: entry.id, label: entry.label }));
}

// Same "one shared function, all three implementations call it" rule as
// resolveLineItemColumns above — the builder calls this with its live
// local state (so the columns appear the instant a row's foreignCurrency
// is set, before any save), the two read-only renderers call it with the
// document's already-frozen line items. Returns null when no line item
// has any FX provenance at all, so both columns are omitted entirely —
// per the spec, no empty FX columns on a document that doesn't use them.
//
// Gated on foreignRate/exchangeRate being present, not just
// foreignCurrency — a real production document was found with
// foreignRate/exchangeRate saved but foreignCurrency null (the currency
// code alone failed to persist on that save), and gating on
// foreignCurrency only made this function silently suppress both
// columns even though the numeric FX data was genuinely there. Matches
// the builder's own hasAnyForeignCurrency check in
// line-items-editor.tsx, which already ORs across all three fields.
export function resolveForeignCurrencyRateLabel(
  lineItems: {
    foreignCurrency: string | null;
    foreignRate?: number | null;
    exchangeRate?: number | null;
  }[],
): string | null {
  const hasAnyFxData = lineItems.some(
    (item) =>
      Boolean(item.foreignCurrency) || item.foreignRate != null || item.exchangeRate != null,
  );
  if (!hasAnyFxData) return null;
  const currencies = new Set(
    lineItems.map((item) => item.foreignCurrency).filter((c): c is string => Boolean(c)),
  );
  if (currencies.size === 0) return "F.C. Rate";
  return currencies.size === 1 ? `${[...currencies][0]} Rate` : "F.C. Rate";
}
