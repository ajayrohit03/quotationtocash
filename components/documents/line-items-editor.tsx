"use client";

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
import type { BuilderProduct, LocalLineItem } from "./types";

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
  onChange,
}: {
  items: LocalLineItem[];
  products: BuilderProduct[];
  gstEnabled: boolean;
  gstDefaultRate: number | null;
  onChange: (items: LocalLineItem[]) => void;
}) {
  const productsById = new Map(products.map((p) => [p.id, p]));

  function updateItem(key: string, patch: Partial<LocalLineItem>) {
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
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
                  colSpan={gstEnabled ? 7 : 6}
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
                      <Input
                        placeholder="Item name"
                        value={item.name}
                        onChange={(e) =>
                          updateItem(item.key, { name: e.target.value })
                        }
                        className="mb-1.5"
                      />
                      <Input
                        placeholder="Description (optional)"
                        value={item.description}
                        onChange={(e) =>
                          updateItem(item.key, { description: e.target.value })
                        }
                        className="h-8 text-xs text-muted-foreground"
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={item.qty}
                        onChange={(e) =>
                          updateItem(item.key, {
                            qty: e.target.valueAsNumber || 0,
                          })
                        }
                        className="text-right"
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={item.rate}
                        onChange={(e) =>
                          updateItem(item.key, {
                            rate: e.target.valueAsNumber || 0,
                          })
                        }
                        className="text-right"
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        value={item.discountPct}
                        onChange={(e) =>
                          updateItem(item.key, {
                            discountPct: e.target.valueAsNumber || 0,
                          })
                        }
                        className="text-right"
                      />
                    </TableCell>
                    {gstEnabled && (
                      <TableCell className="align-top">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
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
                        >
                          <CopyIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove item"
                          onClick={() => removeItem(item.key)}
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
      />
    </div>
  );
}
