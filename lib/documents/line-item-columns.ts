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
