"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import type { Job } from "@prisma/client";
import {
  purchaseLineItemInputSchema,
  type PurchaseLineItemInput,
} from "@/lib/validation/purchase-invoice";
import { JobPicker } from "@/components/jobs/job-picker";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// Manual entry only for Phase 1 (design doc §5) — save-on-submit, not
// the sales builder's per-keystroke autosave (document-builder.tsx).
// Same end-user capability either way; the simpler save-once shape
// keeps this stage's scope tractable given how much bigger a purchase
// invoice's field set already is (shipment details + dual-currency
// line items) versus a sales document.
const builderFormSchema = z.object({
  vendorId: z.string().min(1, "Select a vendor"),
  vendorInvoiceNumber: z.string().trim().min(1, "Required"),
  vendorInvoiceDate: z.string().min(1, "Required"),
  dueDate: z.string().optional(),
  currency: z.string().trim().min(3).max(3),
  exchangeRate: z.string().optional(),
  roundTotal: z.boolean(),

  shipmentMode: z.string().optional(),
  vesselVoyage: z.string().optional(),
  sailedDate: z.string().optional(),
  portOfLoading: z.string().optional(),
  portOfDischarge: z.string().optional(),
  originPort: z.string().optional(),
  placeOfDelivery: z.string().optional(),
  shipper: z.string().optional(),
  ciReference: z.string().optional(),
  salesPerson: z.string().optional(),
  containerNo: z.string().optional(),
  jobRef: z.string().optional(),
  customerRef: z.string().optional(),
  packageType: z.string().optional(),
  noOfPackages: z.string().optional(),
  hbl: z.string().optional(),
  mbl: z.string().optional(),
  weightKg: z.string().optional(),
  chargeableWeight: z.string().optional(),
  volumeCbm: z.string().optional(),
  customsDocRef: z.string().optional(),
  termsOfShipment: z.string().optional(),

  notes: z.string().optional(),

  lineItems: z.array(purchaseLineItemInputSchema).min(1, "Add at least one line item"),
});

type BuilderFormValues = z.infer<typeof builderFormSchema>;

// A factory, not a shared constant — react-hook-form's useFieldArray
// docs explicitly warn against passing the same object reference to
// multiple append() calls (or reusing it as both an append() argument
// and the array's own initial defaultValues): doing so can bind
// multiple rows to the same underlying reference instead of giving each
// row its own independent value. A fresh object per call is the only
// safe pattern.
function createEmptyLineItem(): PurchaseLineItemInput {
  return {
    description: "",
    sac: "",
    qty: 1,
    unit: "",
    rate: 0,
    gstRate: null,
  };
}

function toStr(value: number | Date | null | undefined): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export function PurchaseInvoiceBuilder({
  mode,
  vendors,
  jobs,
  initialJob,
  gstEnabled,
  purchaseInvoiceId,
  initialValues,
}: {
  mode: "create" | "edit";
  vendors: { id: string; name: string }[];
  jobs: Job[];
  initialJob?: Job | null;
  gstEnabled: boolean;
  purchaseInvoiceId?: string;
  initialValues?: Partial<BuilderFormValues>;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [debugPayload, setDebugPayload] = useState<string | null>(null);
  // Optional job link — see docs/job-pnl-phase2-design.md §1.2/§5.2.
  // Kept as plain local state (not part of the react-hook-form schema
  // above) since JobPicker needs the full Job object to render, not
  // just an id — same shape document-builder.tsx's own `job` state
  // uses.
  const [job, setJob] = useState<Job | null>(initialJob ?? null);
  const [allJobs, setAllJobs] = useState(jobs);
  // Base UI's Select.Value only resolves a label by finding the matching
  // SelectItem that has actually rendered inside the popup — on first
  // paint with a value set from server data (editing an existing
  // invoice), before the popup has ever been opened, there's nothing to
  // find and it falls back to showing the raw id. Same fix as
  // app/(app)/settings/team-tab.tsx's manager select: an explicit
  // children render-function on SelectValue, not the implicit lookup.
  const vendorNameById = new Map(vendors.map((vendor) => [vendor.id, vendor.name]));

  const form = useForm<BuilderFormValues>({
    resolver: zodResolver(builderFormSchema),
    defaultValues: {
      vendorId: initialValues?.vendorId ?? "",
      vendorInvoiceNumber: initialValues?.vendorInvoiceNumber ?? "",
      vendorInvoiceDate: initialValues?.vendorInvoiceDate ?? toStr(new Date()),
      dueDate: initialValues?.dueDate ?? "",
      currency: initialValues?.currency ?? "INR",
      exchangeRate: initialValues?.exchangeRate ?? "",
      roundTotal: initialValues?.roundTotal ?? false,
      shipmentMode: initialValues?.shipmentMode ?? "",
      vesselVoyage: initialValues?.vesselVoyage ?? "",
      sailedDate: initialValues?.sailedDate ?? "",
      portOfLoading: initialValues?.portOfLoading ?? "",
      portOfDischarge: initialValues?.portOfDischarge ?? "",
      originPort: initialValues?.originPort ?? "",
      placeOfDelivery: initialValues?.placeOfDelivery ?? "",
      shipper: initialValues?.shipper ?? "",
      ciReference: initialValues?.ciReference ?? "",
      salesPerson: initialValues?.salesPerson ?? "",
      containerNo: initialValues?.containerNo ?? "",
      jobRef: initialValues?.jobRef ?? "",
      customerRef: initialValues?.customerRef ?? "",
      packageType: initialValues?.packageType ?? "",
      noOfPackages: initialValues?.noOfPackages ?? "",
      hbl: initialValues?.hbl ?? "",
      mbl: initialValues?.mbl ?? "",
      weightKg: initialValues?.weightKg ?? "",
      chargeableWeight: initialValues?.chargeableWeight ?? "",
      volumeCbm: initialValues?.volumeCbm ?? "",
      customsDocRef: initialValues?.customsDocRef ?? "",
      termsOfShipment: initialValues?.termsOfShipment ?? "",
      notes: initialValues?.notes ?? "",
      lineItems: initialValues?.lineItems ?? [createEmptyLineItem()],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });

  const currency = form.watch("currency");
  const showFc = currency.trim().toUpperCase() !== "INR";

  function num(value: string | undefined): number | null {
    if (value == null || value.trim() === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  async function onSubmit(values: BuilderFormValues) {
    setSubmitting(true);
    try {
      // Diagnostic for the "does the form actually hold what was
      // typed" question — the live RHF-tracked values, exactly as
      // handleSubmit resolved them, logged before anything is built
      // from them or sent. If the browser console shows the entered
      // text/numbers here but the saved record still shows old data,
      // the bug is downstream (network payload construction or the
      // API); if this log itself already shows stale/default values,
      // the bug is upstream of submit (an input not actually updating
      // RHF's state) and would be the very next thing to chase.
      console.log("[purchase-invoice-builder] form values at submit:", values);
      let id = purchaseInvoiceId;

      if (mode === "create") {
        const createResponse = await fetch("/api/purchase-invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vendorId: values.vendorId }),
        });
        const createBody = await createResponse.json().catch(() => null);
        if (!createResponse.ok) {
          toast.error(createBody?.error ?? "Couldn't create purchase invoice.");
          return;
        }
        id = createBody.purchaseInvoice.id;
      }

      const payload = {
        vendorId: values.vendorId,
        jobId: job?.id ?? null,
        vendorInvoiceNumber: values.vendorInvoiceNumber,
        vendorInvoiceDate: values.vendorInvoiceDate,
        dueDate: values.dueDate || null,
        currency: values.currency.trim().toUpperCase(),
        exchangeRate: num(values.exchangeRate),
        roundTotal: values.roundTotal,
        shipmentMode: values.shipmentMode || null,
        vesselVoyage: values.vesselVoyage || null,
        sailedDate: values.sailedDate || null,
        portOfLoading: values.portOfLoading || null,
        portOfDischarge: values.portOfDischarge || null,
        originPort: values.originPort || null,
        placeOfDelivery: values.placeOfDelivery || null,
        shipper: values.shipper || null,
        ciReference: values.ciReference || null,
        salesPerson: values.salesPerson || null,
        containerNo: values.containerNo || null,
        jobRef: values.jobRef || null,
        customerRef: values.customerRef || null,
        packageType: values.packageType || null,
        noOfPackages: num(values.noOfPackages),
        hbl: values.hbl || null,
        mbl: values.mbl || null,
        weightKg: num(values.weightKg),
        chargeableWeight: num(values.chargeableWeight),
        volumeCbm: num(values.volumeCbm),
        customsDocRef: values.customsDocRef || null,
        termsOfShipment: values.termsOfShipment || null,
        notes: values.notes || null,
        lineItems: values.lineItems.map((item) => ({
          ...item,
          sac: item.sac || undefined,
          unit: item.unit || undefined,
          gstRate: gstEnabled ? item.gstRate : null,
        })),
      };

      const response = await fetch(`/api/purchase-invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't save purchase invoice.");
        return;
      }

      toast.success("Purchase invoice saved");
      router.push(`/purchase-invoices/${id}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6 pb-24">
        <Card>
          <CardHeader>
            <CardTitle>Vendor & invoice details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <FormField
              control={form.control}
              name="vendorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendor</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select vendor">
                          {(value: string) => vendorNameById.get(value) ?? value}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="vendorInvoiceNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor invoice no.</FormLabel>
                    <FormControl>
                      <Input placeholder="POL/2026/0142" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vendorInvoiceDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <FormControl>
                      <Input
                        className="uppercase"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {showFc && (
                <FormField
                  control={form.control}
                  name="exchangeRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Exchange rate (to INR)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.000001" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="roundTotal"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-end gap-2 pb-1.5">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Round total</FormLabel>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Job</Label>
              <JobPicker
                jobs={allJobs}
                selected={job}
                onChange={setJob}
                onJobCreated={(created) => setAllJobs((prev) => [created, ...prev])}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shipment details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            {(
              [
                ["shipmentMode", "Shipment mode"],
                ["vesselVoyage", "Vessel/Voyage"],
                ["sailedDate", "Sailed date", "date"],
                ["portOfLoading", "Port of loading"],
                ["portOfDischarge", "Port of discharge"],
                ["originPort", "Origin port"],
                ["placeOfDelivery", "Place of delivery"],
                ["shipper", "Shipper"],
                ["ciReference", "CI reference"],
                ["salesPerson", "Sales person"],
                ["containerNo", "Container no."],
                ["jobRef", "Job ref"],
                ["customerRef", "Customer ref"],
                ["packageType", "Package type"],
                ["noOfPackages", "No. of packages", "number"],
                ["hbl", "HBL"],
                ["mbl", "MBL"],
                ["weightKg", "Weight (KGS)", "number"],
                ["chargeableWeight", "Chargeable weight", "number"],
                ["volumeCbm", "Volume (CBM)", "number"],
                ["customsDocRef", "Customs doc ref"],
                ["termsOfShipment", "Terms of shipment"],
              ] as const
            ).map(([name, label, type]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                      <Input type={type ?? "text"} {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Line items</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append(createEmptyLineItem())}
            >
              <Plus className="size-4" /> Add line
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {fields.map((item, index) => (
              <div key={item.id} className="grid grid-cols-12 gap-2 rounded-lg border border-border p-3">
                <div className="col-span-4">
                  <FormField
                    control={form.control}
                    name={`lineItems.${index}.description`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Description</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="col-span-2">
                  <FormField
                    control={form.control}
                    name={`lineItems.${index}.sac`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">SAC</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="col-span-1">
                  <FormField
                    control={form.control}
                    name={`lineItems.${index}.qty`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Qty</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="col-span-1">
                  <FormField
                    control={form.control}
                    name={`lineItems.${index}.unit`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">UOM</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="col-span-2">
                  <FormField
                    control={form.control}
                    name={`lineItems.${index}.rate`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Rate</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {gstEnabled && (
                  <div className="col-span-1">
                    <FormField
                      control={form.control}
                      name={`lineItems.${index}.gstRate`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">GST %</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(e.target.value === "" ? null : Number(e.target.value))
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
                <div className="col-span-1 flex items-end justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => fields.length > 1 && remove(index)}
                    disabled={fields.length === 1}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {form.formState.errors.lineItems?.root && (
              <p className="text-sm text-destructive">
                {form.formState.errors.lineItems.root.message}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea rows={3} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {debugPayload && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Current form values (not submitted)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs">
                {debugPayload}
              </pre>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-2">
          {/* Diagnostic-only: shows exactly what react-hook-form
              currently holds for every field, without submitting —
              lets a live browser session confirm whether typed values
              actually made it into form state before worrying about
              anything downstream (the network request, the API). Not
              a permanent product feature; safe to remove once the
              live-data investigation this was added for is resolved. */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setDebugPayload(JSON.stringify(form.getValues(), null, 2))}
          >
            Preview form values
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save purchase invoice"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
