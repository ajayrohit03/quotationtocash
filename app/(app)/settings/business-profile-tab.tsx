"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  businessUpdateSchema,
  type BusinessUpdateInput,
} from "@/lib/validation/business";
import { toSettingsBusiness, type SettingsBusiness } from "./types";
import { INDIAN_STATES } from "@/lib/constants/indian-states";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function BusinessProfileTab({
  business,
  readOnly,
  onUpdated,
}: {
  business: SettingsBusiness;
  readOnly: boolean;
  onUpdated: (business: SettingsBusiness) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const form = useForm<BusinessUpdateInput>({
    resolver: zodResolver(businessUpdateSchema),
    values: {
      name: business.name,
      email: business.email,
      phone: business.phone ?? "",
      address: business.address ?? "",
      city: business.city ?? "",
      state: business.state ?? "",
      country: business.country ?? "",
      website: business.website ?? "",
    },
  });

  async function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/business/logo", {
        method: "POST",
        body: formData,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't upload logo. Try again.");
        return;
      }
      onUpdated(toSettingsBusiness(body.business));
      toast.success("Logo uploaded");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveLogo() {
    setRemoving(true);
    try {
      const response = await fetch("/api/business/logo", { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't remove logo. Try again.");
        return;
      }
      onUpdated(toSettingsBusiness(body.business));
    } finally {
      setRemoving(false);
    }
  }

  async function onSubmit(values: BusinessUpdateInput) {
    // Belt-and-suspenders alongside the disabled inputs below and the
    // server's own requireBusinessAdmin() check: stops a
    // form.requestSubmit() bypass from even firing the request, the same
    // pattern document-builder.tsx's save() uses for the draft lock.
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
      toast.success("Business profile updated");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="border-b border-border pb-4">
        <div className="text-base font-semibold">Business profile</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Shown in the header of every document.
        </p>
      </div>

      <div className="mt-5 flex items-center gap-5">
        <div className="flex size-20 flex-none items-center justify-center overflow-hidden rounded-xl border border-dashed border-input bg-muted">
          {business.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
            <img
              src={business.logoUrl}
              alt="Business logo"
              className="size-full object-contain"
            />
          ) : (
            <span className="font-mono text-[10px] text-muted-foreground">
              No logo
            </span>
          )}
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleLogoChange}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploading || removing}
              onClick={() => inputRef.current?.click()}
            >
              {uploading
                ? "Uploading…"
                : business.logoUrl
                  ? "Replace logo"
                  : "Upload logo"}
            </Button>
            {business.logoUrl && (
              <Button
                type="button"
                variant="ghost"
                disabled={uploading || removing}
                onClick={handleRemoveLogo}
              >
                {removing ? "Removing…" : "Remove"}
              </Button>
            )}
          </div>
        )}
      </div>

      <Form {...form}>
        <fieldset disabled={readOnly}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="mt-6 grid grid-cols-2 gap-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Business name</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={readOnly} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} disabled={readOnly} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} disabled={readOnly} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} disabled={readOnly} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} disabled={readOnly} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <Select
                    value={field.value || undefined}
                    onValueChange={field.onChange}
                    disabled={readOnly}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {INDIAN_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
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
              name="country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} disabled={readOnly} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} disabled={readOnly} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!readOnly && (
              <Button type="submit" disabled={submitting} className="col-span-2 mt-2 w-fit">
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            )}
          </form>
        </fieldset>
      </Form>
    </div>
  );
}
