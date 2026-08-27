"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  businessUpdateSchema,
  type BusinessUpdateInput,
} from "@/lib/validation/business";
import { toSettingsBusiness, type SettingsBusiness } from "./types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// Only the four default-prefill fields are submitted here — template and
// accent color live on the Appearance tab, and numbering is shown as
// plain info (it's an atomic per-year counter, not something safe to
// hand-edit — see lib/documents/numbering.ts).
type DocumentsFormValues = Pick<
  BusinessUpdateInput,
  "defaultPaymentTerms" | "defaultValidityTerms" | "defaultNotes" | "defaultTermsText"
>;

const documentsFormSchema = businessUpdateSchema.pick({
  defaultPaymentTerms: true,
  defaultValidityTerms: true,
  defaultNotes: true,
  defaultTermsText: true,
});

export function DocumentsTab({
  business,
  readOnly,
  onUpdated,
}: {
  business: SettingsBusiness;
  readOnly: boolean;
  onUpdated: (business: SettingsBusiness) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const year = new Date().getFullYear();

  const form = useForm<DocumentsFormValues>({
    resolver: zodResolver(documentsFormSchema),
    values: {
      defaultPaymentTerms: business.defaultPaymentTerms ?? "",
      defaultValidityTerms: business.defaultValidityTerms ?? "",
      defaultNotes: business.defaultNotes ?? "",
      defaultTermsText: business.defaultTermsText ?? "",
    },
  });

  async function onSubmit(values: DocumentsFormValues) {
    // Belt-and-suspenders alongside the disabled fields and the server's
    // own requireBusinessAdmin() check — see business-profile-tab.tsx.
    if (readOnly) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't save. Try again.");
        return;
      }
      onUpdated(toSettingsBusiness(body.business));
      toast.success("Document defaults updated");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="border-b border-border pb-4">
        <div className="text-base font-semibold">Documents</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Numbering and the defaults that prefill every new document.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Quotation numbering</span>
          <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 font-mono text-sm text-muted-foreground">
            QT-{year}-0001
          </div>
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Invoice numbering</span>
          <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 font-mono text-sm text-muted-foreground">
            INV-{year}-0001
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Numbers assign automatically, in order, and reset each year.
      </p>

      <div className="mt-6 border-t border-border pt-6">
        <div className="mb-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Defaults for new documents
        </div>
        <Form {...form}>
          <fieldset disabled={readOnly}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="grid grid-cols-2 gap-4"
            >
            <FormField
              control={form.control}
              name="defaultPaymentTerms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default payment terms</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. Net 15"
                      rows={2}
                      {...field}
                      value={field.value ?? ""}
                      disabled={readOnly}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="defaultValidityTerms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default quotation validity</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. Valid for 15 days"
                      rows={2}
                      {...field}
                      value={field.value ?? ""}
                      disabled={readOnly}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="defaultNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Thanks for the opportunity."
                      rows={3}
                      {...field}
                      value={field.value ?? ""}
                      disabled={readOnly}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="defaultTermsText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default terms &amp; conditions</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="50% advance, balance on delivery."
                      rows={3}
                      {...field}
                      value={field.value ?? ""}
                      disabled={readOnly}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!readOnly && (
              <Button
                type="submit"
                disabled={submitting}
                className="col-span-2 mt-2 w-fit"
              >
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            )}
            </form>
          </fieldset>
        </Form>
      </div>
    </div>
  );
}
