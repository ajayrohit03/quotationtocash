"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  customFieldDefinitionCreateSchema,
  type CustomFieldDefinitionCreateInput,
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

// "both" (not editing) UI value for appliesTo maps to `null` on the wire.
const APPLIES_TO_ANY = "both";

export function AddCustomFieldDialog({
  scope,
  onAdded,
}: {
  scope: "document" | "lineItem";
  onAdded: (definition: SettingsCustomFieldDefinition) => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<{
    label: string;
    type: "text" | "number" | "date";
    appliesTo: "both" | "quotation" | "invoice";
  }>({
    defaultValues: { label: "", type: "text", appliesTo: APPLIES_TO_ANY },
  });

  async function onSubmit(values: {
    label: string;
    type: "text" | "number" | "date";
    appliesTo: "both" | "quotation" | "invoice";
  }) {
    const input: CustomFieldDefinitionCreateInput = {
      label: values.label,
      type: values.type,
      scope,
      appliesTo: values.appliesTo === APPLIES_TO_ANY ? null : values.appliesTo,
    };
    const parsed = customFieldDefinitionCreateSchema.safeParse(input);
    if (!parsed.success) {
      form.setError("label", { message: parsed.error.issues[0]?.message });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/business/custom-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't add field. Try again.");
        return;
      }
      onAdded(body.definition as SettingsCustomFieldDefinition);
      toast.success("Field added");
      setOpen(false);
      form.reset();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        Add field
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Add {scope === "document" ? "document" : "line item"} field
          </DialogTitle>
          <DialogDescription>
            You can edit or archive this any time — archiving never affects
            documents that already used it.
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
                    <Input
                      placeholder={
                        scope === "document" ? "Container No." : "Gross Weight"
                      }
                      {...field}
                    />
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
                {submitting ? "Adding…" : "Add field"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
