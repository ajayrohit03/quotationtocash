"use client";

import { useMemo, useState } from "react";
import type { Customer } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { QuickAddCustomerDialog } from "./quick-add-customer-dialog";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function CustomerPicker({
  customers,
  selected,
  onChange,
  onCustomerCreated,
}: {
  customers: Customer[];
  selected: Customer | null;
  onChange: (customer: Customer) => void;
  onCustomerCreated: (customer: Customer) => void;
}) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q),
    );
  }, [customers, search]);

  return (
    <div>
      {selected ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/50 p-3.5">
          <div className="flex size-9 flex-none items-center justify-center rounded-md bg-secondary text-xs font-semibold">
            {initials(selected.name) || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{selected.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {[selected.email, selected.city].filter(Boolean).join(" · ") ||
                selected.company ||
                "No contact details"}
            </p>
          </div>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="text-sm font-medium text-primary hover:underline"
                />
              }
            >
              Change
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <CustomerList
                customers={filtered}
                search={search}
                onSearchChange={setSearch}
                onSelect={(customer) => {
                  onChange(customer);
                  setOpen(false);
                }}
                onAddNew={() => {
                  setOpen(false);
                  setAddOpen(true);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={<Button variant="outline" />}>
            Select customer
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-0">
            <CustomerList
              customers={filtered}
              search={search}
              onSearchChange={setSearch}
              onSelect={(customer) => {
                onChange(customer);
                setOpen(false);
              }}
              onAddNew={() => {
                setOpen(false);
                setAddOpen(true);
              }}
            />
          </PopoverContent>
        </Popover>
      )}

      <QuickAddCustomerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(customer) => {
          onCustomerCreated(customer);
          onChange(customer);
        }}
      />
    </div>
  );
}

function CustomerList({
  customers,
  search,
  onSearchChange,
  onSelect,
  onAddNew,
}: {
  customers: Customer[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (customer: Customer) => void;
  onAddNew: () => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="p-2">
        <Input
          autoFocus
          placeholder="Search customers…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {customers.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            No customers found
          </p>
        ) : (
          customers.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => onSelect(customer)}
              className="flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <span className="font-medium">{customer.name}</span>
              {(customer.company || customer.email) && (
                <span className="text-xs text-muted-foreground">
                  {customer.company || customer.email}
                </span>
              )}
            </button>
          ))
        )}
      </div>
      <div className="border-t border-border p-1">
        <button
          type="button"
          onClick={onAddNew}
          className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm font-medium text-primary hover:bg-muted"
        >
          + Add new customer
        </button>
      </div>
    </div>
  );
}
