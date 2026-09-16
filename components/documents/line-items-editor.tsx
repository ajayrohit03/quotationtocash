"use client";

import { useState } from "react";
import { CopyIcon, XIcon } from "lucide-react";
import { calculateLineAmount } from "@/lib/documents/calculations";
import { resolveGstRate } from "@/lib/tax/resolveGstRate";
import { formatCurrency } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddLineItemMenu } from "./add-line-item-menu";
import type {
  BuilderProduct,
  LocalLineItem,
  BuilderCustomFieldDefinition,
} from "./types";

let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `local-${Date.now()}-${keyCounter}`;
}

export function newLineItemKey() {
  return nextKey();
}

export function LineItemsEditor({
  items,
  products,
  gstEnabled,
  gstDefaultRate,
  customFieldDefinitions,
  onChange,
  disabled = false,
}: {
  items: LocalLineItem[];
  products: BuilderProduct[];
  gstEnabled: boolean;
  gstDefaultRate: number | null;
  customFieldDefinitions: BuilderCustomFieldDefinition[];
  onChange: (items: LocalLineItem[]) => void;
  disabled?: boolean;
}) {
  const sortedCustomFieldDefinitions = [...customFieldDefinitions].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const productsById = new Map(products.map((p) => [p.id, p]));
  // Rows with the foreign-currency inputs visible — separate from
  // whether foreignCurrency actually has a value, so opening the block
  // to start typing doesn't require a value to already exist. A row
  // that already has foreignCurrency set (loaded from a saved document)
  // is always shown expanded regardless of this set's contents.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  function updateItem(key: string, patch: Partial<LocalLineItem>) {
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  // §2: editing foreignRate or exchangeRate recomputes rate =
  // round(foreignRate × exchangeRate, 2) once, synchronously — the only
  // trigger. Editing foreignCurrency alone never touches rate.
  function updateForeignFields(
    key: string,
    patch: Partial<Pick<LocalLineItem, "foreignCurrency" | "foreignRate" | "exchangeRate">>,
  ) {
    onChange(
      items.map((item) => {
        if (item.key !== key) return item;
        const merged = { ...item, ...patch };
        if ("foreignRate" in patch || "exchangeRate" in patch) {
          if (merged.foreignRate != null && merged.exchangeRate != null) {
            merged.rate = Math.round(merged.foreignRate * merged.exchangeRate * 100) / 100;
          }
        }
        return merged;
      }),
    );
  }

  function removeForeignCurrency(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    updateItem(key, { foreignCurrency: null, foreignRate: null, exchangeRate: null });
  }

  // Upserts (or removes, if blanked) one definition's value within a
  // row's customFieldValues array — same "skip if blank" rule as the
  // document-level fields (see document-builder.tsx's customFieldValues
  // useMemo): a cleared input means that field isn't saved at all for
  // this row, not saved with an empty value.
  function updateLineItemCustomField(
    key: string,
    def: BuilderCustomFieldDefinition,
    rawValue: string,
  ) {
    onChange(
      items.map((item) => {
        if (item.key !== key) return item;
        const withoutThisField = item.customFieldValues.filter(
          (v) => v.definitionId !== def.id,
        );
        const trimmed = rawValue.trim();
        if (!trimmed) {
          return { ...item, customFieldValues: withoutThisField };
        }
        return {
          ...item,
          customFieldValues: [
            ...withoutThisField,
            {
              definitionId: def.id,
              label: def.label,
              type: def.type,
              value: def.type === "number" ? Number(trimmed) : trimmed,
              sortOrder: def.sortOrder,
            },
          ],
        };
      }),
    );
  }

  function removeItem(key: string) {
    onChange(items.filter((item) => item.key !== key));
  }

  function duplicateItem(key: string) {
    const index = items.findIndex((item) => item.key === key);
    if (index === -1) return;
    const copy = { ...items[index], key: nextKey() };
    onChange([...items.slice(0, index + 1), copy, ...items.slice(index + 1)]);
  }

  function addFromProduct(product: BuilderProduct) {
    onChange([
      ...items,
      {
        key: nextKey(),
        productId: product.id,
        name: product.name,
        description: product.description ?? "",
        qty: 1,
        rate: product.price,
        discountPct: 0,
        gstRate: null,
        foreignCurrency: null,
        foreignRate: null,
        exchangeRate: null,
        customFieldValues: [],
      },
    ]);
  }

  function addCustom() {
    onChange([
      ...items,
      {
        key: nextKey(),
        productId: null,
        name: "",
        description: "",
        qty: 1,
        rate: 0,
        discountPct: 0,
        gstRate: null,
        foreignCurrency: null,
        foreignRate: null,
        exchangeRate: null,
        customFieldValues: [],
      },
    ]);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-56">Item &amp; description</TableHead>
              {sortedCustomFieldDefinitions.map((def) => (
                <TableHead key={def.id} className="w-32">
                  {def.label}
                </TableHead>
              ))}
              <TableHead className="w-20 text-right">Qty</TableHead>
              <TableHead className="w-28 text-right">Rate</TableHead>
              <TableHead className="w-24 text-right">Discount %</TableHead>
              {gstEnabled && (
                <TableHead className="w-24 text-right">GST %</TableHead>
              )}
              <TableHead className="w-32 text-right">Amount</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={
                    (gstEnabled ? 7 : 6) + sortedCustomFieldDefinitions.length
                  }
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No items yet — add a product or a custom line below.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const product = item.productId
                  ? productsById.get(item.productId)
                  : undefined;
                const resolvedRate = resolveGstRate(
                  item.gstRate,
                  product?.gstRate,
                  gstDefaultRate,
                );
                const amount = calculateLineAmount(item);

                return (
                  <TableRow key={item.key}>
                    <TableCell className="align-top">
                      {/*
                        A plain <input> defaults to display: inline-block.
                        Without this wrapper, these two inputs were direct
                        children of the <td> with nothing forcing a line
                        break between them, so they laid out side by side
                        instead of stacked — each claiming its own ~200px
                        intrinsic width, overflowing the intended column
                        and cascading a width-miscalculation into every
                        column after it (that's what caused the reported
                        Qty-field overlap; autoComplete="off" was real
                        hygiene but not the actual cause).
                      */}
                      <div className="flex flex-col gap-1.5">
                        <Input
                          placeholder="Item name"
                          autoComplete="off"
                          value={item.name}
                          onChange={(e) =>
                            updateItem(item.key, { name: e.target.value })
                          }
                          disabled={disabled}
                        />
                        <Input
                          placeholder="Description (optional)"
                          autoComplete="off"
                          value={item.description}
                          onChange={(e) =>
                            updateItem(item.key, { description: e.target.value })
                          }
                          className="h-8 text-xs text-muted-foreground"
                          disabled={disabled}
                        />
                      </div>
                    </TableCell>
                    {sortedCustomFieldDefinitions.map((def) => {
                      const current = item.customFieldValues.find(
                        (v) => v.definitionId === def.id,
                      );
                      return (
                        <TableCell key={def.id} className="align-top">
                          <Input
                            type={
                              def.type === "number"
                                ? "number"
                                : def.type === "date"
                                  ? "date"
                                  : "text"
                            }
                            step={def.type === "number" ? "any" : undefined}
                            autoComplete="off"
                            value={current?.value ?? ""}
                            onChange={(e) =>
                              updateLineItemCustomField(item.key, def, e.target.value)
                            }
                            disabled={disabled}
                          />
                        </TableCell>
                      );
                    })}
                    <TableCell className="align-top">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        autoComplete="off"
                        value={item.qty}
                        onChange={(e) =>
                          updateItem(item.key, {
                            qty: e.target.valueAsNumber || 0,
                          })
                        }
                        className="text-right"
                        disabled={disabled}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        autoComplete="off"
                        value={item.rate}
                        onChange={(e) =>
                          updateItem(item.key, {
                            rate: e.target.valueAsNumber || 0,
                          })
                        }
                        className="text-right"
                        disabled={disabled}
                      />
                      {expandedKeys.has(item.key) || item.foreignCurrency != null ? (
                        <div className="mt-1.5 flex flex-col gap-1">
                          <Input
                            placeholder="USD"
                            autoComplete="off"
                            value={item.foreignCurrency ?? ""}
                            onChange={(e) =>
                              updateForeignFields(item.key, {
                                foreignCurrency: e.target.value.toUpperCase() || null,
                              })
                            }
                            className="h-7 text-right text-xs uppercase"
                            disabled={disabled}
                          />
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            placeholder="Foreign rate"
                            autoComplete="off"
                            value={item.foreignRate ?? ""}
                            onChange={(e) =>
                              updateForeignFields(item.key, {
                                foreignRate:
                                  e.target.value === "" ? null : e.target.valueAsNumber,
                              })
                            }
                            className="h-7 text-right text-xs"
                            disabled={disabled}
                          />
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            placeholder="Exchange rate"
                            autoComplete="off"
                            value={item.exchangeRate ?? ""}
                            onChange={(e) =>
                              updateForeignFields(item.key, {
                                exchangeRate:
                                  e.target.value === "" ? null : e.target.valueAsNumber,
                              })
                            }
                            className="h-7 text-right text-xs"
                            disabled={disabled}
                          />
                          {!disabled && (
                            <button
                              type="button"
                              onClick={() => removeForeignCurrency(item.key)}
                              className="text-right text-xs text-muted-foreground underline"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ) : (
                        !disabled && (
                          <div className="mt-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedKeys((prev) => new Set(prev).add(item.key))
                              }
                              className="text-xs text-muted-foreground underline"
                            >
                              + Foreign currency
                            </button>
                          </div>
                        )
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        autoComplete="off"
                        value={item.discountPct}
                        onChange={(e) =>
                          updateItem(item.key, {
                            discountPct: e.target.valueAsNumber || 0,
                          })
                        }
                        className="text-right"
                        disabled={disabled}
                      />
                    </TableCell>
                    {gstEnabled && (
                      <TableCell className="align-top">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          autoComplete="off"
                          placeholder={resolvedRate?.toString() ?? "0"}
                          value={item.gstRate ?? ""}
                          onChange={(e) =>
                            updateItem(item.key, {
                              gstRate:
                                e.target.value === ""
                                  ? null
                                  : e.target.valueAsNumber,
                            })
                          }
                          className="text-right"
                          disabled={disabled}
                        />
                      </TableCell>
                    )}
                    <TableCell className="pt-4 text-right font-mono text-sm font-medium">
                      {formatCurrency(amount)}
                    </TableCell>
                    <TableCell className="pt-4">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Duplicate item"
                          onClick={() => duplicateItem(item.key)}
                          disabled={disabled}
                        >
                          <CopyIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove item"
                          onClick={() => removeItem(item.key)}
                          disabled={disabled}
                        >
                          <XIcon />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <AddLineItemMenu
        products={products}
        onSelectProduct={addFromProduct}
        onAddCustom={addCustom}
        disabled={disabled}
      />
    </div>
  );
}
