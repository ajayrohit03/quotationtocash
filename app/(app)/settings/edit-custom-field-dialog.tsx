"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  customFieldDefinitionUpdateSchema,
  type CustomFieldDefinitionUpdateInput,
} from "@/lib/validation/custom-fields";
import type { SettingsCustomFieldDefinition } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const TYPE_LABEL = { text: "Text", number: "Number", date: "Date" } as const;
const APPLIES_TO_LABEL = {
  both: "Quotations & invoices",
  quotation: "Quotations only",
  invoice: "Invoices & proforma invoices only",
} as const;
const APPLIES_TO_ANY = "both";

// scope is deliberately not a field here — fixed at creation, see
// lib/validation/custom-fields.ts. Same shape as edit-product-dialog.tsx
// (values-based prefill, so reopening after a save shows current data).
export function EditCustomFieldDialog({
  definition,
  onUpdated,
}: {
  definition: SettingsCustomFieldDefinition;
  onUpdated: (definition: SettingsCustomFieldDefinition) => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<{
    label: string;
    type: "text" | "number" | "date";
    appliesTo: "both" | "quotation" | "invoice";
  }>({
    values: {
      label: definition.label,
      type: definition.type,
      // "proforma" is never actually stored here (see
      // customFieldAppliesToWhere's comment) — this editor's tri-state
      // dropdown treats "invoice" as covering proforma too, so it has
      // nothing separate to show even in the unreachable case where it
      // is.
      appliesTo:
        definition.appliesTo === "proforma" ? "invoice" : (definition.appliesTo ?? APPLIES_TO_ANY),
    },
  });

  async function onSubmit(values: {
    label: string;
    type: "text" | "number" | "date";
    appliesTo: "both" | "quotation" | "invoice";
  }) {
    const input: CustomFieldDefinitionUpdateInput = {
      label: values.label,
      type: values.type,
      appliesTo: values.appliesTo === APPLIES_TO_ANY ? null : values.appliesTo,
    };
    const parsed = customFieldDefinitionUpdateSchema.safeParse(input);
    if (!parsed.success) {
      form.setError("label", { message: parsed.error.issues[0]?.message });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/business/custom-fields/${definition.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't save. Try again.");
        return;
      }
      onUpdated(body.definition as SettingsCustomFieldDefinition);
      toast.success("Field updated");
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        Edit
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit field</DialogTitle>
          <DialogDescription>
            Changes apply to new documents only — sent and historical
            documents keep the label and type they were created with.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value: keyof typeof TYPE_LABEL) => TYPE_LABEL[value]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="appliesTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Applies to</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value: keyof typeof APPLIES_TO_LABEL) =>
                          APPLIES_TO_LABEL[value]
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(APPLIES_TO_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="mt-2">
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
