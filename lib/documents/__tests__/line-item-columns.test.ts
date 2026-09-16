import { describe, expect, it } from "vitest";
import { resolveLineItemColumns } from "@/lib/documents/line-item-columns";

describe("resolveLineItemColumns", () => {
  it("derives columns from the union of all line items' custom field values, deduplicated", () => {
    const columns = resolveLineItemColumns([
      {
        customFieldValues: [
          { definitionId: "def-1", label: "SAC Code", type: "text", value: "998399", sortOrder: 0 },
        ],
      },
      {
        customFieldValues: [
          { definitionId: "def-1", label: "SAC Code", type: "text", value: "998311", sortOrder: 0 },
          { definitionId: "def-2", label: "HSN Code", type: "text", value: "8471", sortOrder: 1 },
        ],
      },
    ]);
    expect(columns).toEqual([
      { id: "def-1", label: "SAC Code" },
      { id: "def-2", label: "HSN Code" },
    ]);
  });

  it("sorts by sortOrder, not by first appearance", () => {
    const columns = resolveLineItemColumns([
      {
        customFieldValues: [
          { definitionId: "def-2", label: "Second", type: "text", value: "b", sortOrder: 1 },
          { definitionId: "def-1", label: "First", type: "text", value: "a", sortOrder: 0 },
        ],
      },
    ]);
    expect(columns.map((c) => c.id)).toEqual(["def-1", "def-2"]);
  });

  it("returns [] when no line item has any custom field value", () => {
    expect(resolveLineItemColumns([{ customFieldValues: [] }])).toEqual([]);
    expect(resolveLineItemColumns([])).toEqual([]);
  });

  // The common case this fix targets directly: a line item with no
  // value for a given column must still render (as a blank cell, per
  // the renderers' own "—" fallback), not disappear or shift other
  // columns — this test only proves the column itself still gets
  // derived correctly from whichever OTHER line item does have it.
  it("still includes a column even when only one of several line items has a value for it", () => {
    const columns = resolveLineItemColumns([
      { customFieldValues: [] },
      {
        customFieldValues: [
          { definitionId: "def-1", label: "SAC Code", type: "text", value: "998399", sortOrder: 0 },
        ],
      },
    ]);
    expect(columns).toEqual([{ id: "def-1", label: "SAC Code" }]);
  });
});
