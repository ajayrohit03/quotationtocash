"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Business } from "@prisma/client";
import { gstSetupSchema } from "@/lib/validation/business";
import {
  GST_REGISTRATION_TYPES,
  INDIAN_STATES,
} from "@/lib/constants/indian-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StepShell } from "./step-shell";

export function StepGst({
  business,
  onNext,
  onSkip,
}: {
  business: Business;
  onNext: (business: Business) => void;
  onSkip: () => void;
}) {
  const [gstEnabled, setGstEnabled] = useState(business.gstEnabled);
  const [gstin, setGstin] = useState(business.gstin ?? "");
  const [gstDefaultRate, setGstDefaultRate] = useState(
    business.gstDefaultRate?.toString() ?? "18",
  );
  const [placeOfSupply, setPlaceOfSupply] = useState(
    business.placeOfSupply ?? business.state ?? "",
  );
  const [registrationType, setRegistrationType] = useState(
    business.registrationType ?? "Regular",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue() {
    const input = gstEnabled
      ? {
          gstEnabled: true as const,
          gstin,
          gstDefaultRate: Number(gstDefaultRate),
          placeOfSupply,
          registrationType,
        }
      : { gstEnabled: false as const };

    const parsed = gstSetupSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[String(issue.path[0])] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const response = await fetch("/api/business/gst", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't save GST settings. Try again.");
        return;
      }

      onNext(body.business as Business);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StepShell
      step={3}
      title="Do you charge GST?"
      description="If yes, we'll calculate CGST/SGST or IGST automatically on your documents based on your customer's state."
      onSkip={onSkip}
    >
      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <Label htmlFor="gst-toggle" className="text-sm font-medium">
          Charge GST on invoices
        </Label>
        <Switch
          id="gst-toggle"
          checked={gstEnabled}
          onCheckedChange={setGstEnabled}
        />
      </div>

      {gstEnabled && (
        <div className="mt-5 grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="gstin">GSTIN</Label>
            <Input
              id="gstin"
              placeholder="27AABCU9603R1ZX"
              className="font-mono uppercase"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
            />
            {errors.gstin && (
              <p className="text-sm text-destructive">{errors.gstin}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="gst-rate">Default GST rate (%)</Label>
              <Input
                id="gst-rate"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={gstDefaultRate}
                onChange={(e) => setGstDefaultRate(e.target.value)}
              />
              {errors.gstDefaultRate && (
                <p className="text-sm text-destructive">
                  {errors.gstDefaultRate}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="registration-type">Registration type</Label>
              <Select
                value={registrationType}
                onValueChange={(value) => value && setRegistrationType(value)}
              >
                <SelectTrigger id="registration-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GST_REGISTRATION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="place-of-supply">Place of supply</Label>
            <Select
              value={placeOfSupply}
              onValueChange={(value) => value && setPlaceOfSupply(value)}
            >
              <SelectTrigger id="place-of-supply" className="w-full">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {INDIAN_STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.placeOfSupply && (
              <p className="text-sm text-destructive">
                {errors.placeOfSupply}
              </p>
            )}
          </div>
        </div>
      )}

      <Button
        type="button"
        className="mt-8"
        disabled={submitting}
        onClick={handleContinue}
      >
        {submitting ? "Saving…" : "Continue"}
      </Button>
    </StepShell>
  );
}
