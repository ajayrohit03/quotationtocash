"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BuilderProduct } from "./types";

export function AddLineItemMenu({
  products,
  onSelectProduct,
  onAddCustom,
}: {
  products: BuilderProduct[];
  onSelectProduct: (product: BuilderProduct) => void;
  onAddCustom: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q),
    );
  }, [products, search]);

  return (
    <div className="flex gap-2 p-4">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="border-dashed"
            />
          }
        >
          + Add item
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <div className="p-2">
            <Input
              autoFocus
              placeholder="Search products & services…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                No products found
              </p>
            ) : (
              filtered.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    onSelectProduct(product);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0 truncate font-medium">
                    {product.name}
                  </span>
                  <span className="flex-none font-mono text-xs text-muted-foreground">
                    {formatCurrency(product.price)}
                  </span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="outline"
        className="border-dashed"
        onClick={onAddCustom}
      >
        + Custom line
      </Button>
    </div>
  );
}
