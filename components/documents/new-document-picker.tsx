"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Customer, DocumentType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { CustomerPicker } from "./customer-picker";

const COPY: Record<DocumentType, { title: string; basePath: string }> = {
  quotation: { title: "New quotation", basePath: "/quotations" },
  invoice: { title: "New invoice", basePath: "/invoices" },
};

export function NewDocumentPicker({
  type,
  customers,
  initialCustomerId,
}: {
  type: DocumentType;
  customers: Customer[];
  initialCustomerId?: string;
}) {
  const router = useRouter();
  const copy = COPY[type];
  const [allCustomers, setAllCustomers] = useState(customers);
  const [customer, setCustomer] = useState<Customer | null>(
    customers.find((c) => c.id === initialCustomerId) ?? null,
  );
  const [creating, setCreating] = useState(false);

  async function handleContinue() {
    if (!customer) return;
    setCreating(true);
    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, customerId: customer.id }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't create the draft. Try again.");
        setCreating(false);
        return;
      }
      router.replace(`${copy.basePath}/${body.document.id}`);
    } catch {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="mt-2 text-muted-foreground">
        Pick a customer to start. You can fill in the rest next.
      </p>
      <div className="mt-8">
        <CustomerPicker
          customers={allCustomers}
          selected={customer}
          onChange={setCustomer}
          onCustomerCreated={(created) =>
            setAllCustomers((prev) => [created, ...prev])
          }
        />
      </div>
      <Button
        type="button"
        className="mt-6"
        disabled={!customer || creating}
        onClick={handleContinue}
      >
        {creating ? "Creating…" : "Continue"}
      </Button>
    </div>
  );
}
