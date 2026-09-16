"use client";

import { useState } from "react";
import { toast } from "sonner";
import { gstSetupSchema, businessIdentitySchema } from "@/lib/validation/business";
import { toSettingsBusiness, type SettingsBusiness } from "./types";
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

export function TaxTab({
  business,
  readOnly,
  onUpdated,
}: {
  business: SettingsBusiness;
  readOnly: boolean;
  onUpdated: (business: SettingsBusiness) => void;
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

  // Independent of GST — see businessIdentitySchema's own comment for
  // why these live on their own PATCH /api/business/identity rather
  // than folding into gstSetupSchema's discriminated union above.
  const [pan, setPan] = useState(business.pan ?? "");
  const [tan, setTan] = useState(business.tan ?? "");
  const [cin, setCin] = useState(business.cin ?? "");
  const [swiftCode, setSwiftCode] = useState(business.swiftCode ?? "");
  const [identitySubmitting, setIdentitySubmitting] = useState(false);

  async function handleSave() {
    // Belt-and-suspenders alongside the disabled inputs and the server's
    // own requireBusinessOwner() check — see business-profile-tab.tsx.
    if (readOnly) return;

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
      onUpdated(toSettingsBusiness(body.business));
      toast.success("Tax settings updated");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleIdentitySave() {
    if (readOnly) return;

    const parsed = businessIdentitySchema.safeParse({
      pan: pan || null,
      tan: tan || null,
      cin: cin || null,
      swiftCode: swiftCode || null,
    });
    if (!parsed.success) return;

    setIdentitySubmitting(true);
    try {
      const response = await fetch("/api/business/identity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't save. Try again.");
        return;
      }
      onUpdated(toSettingsBusiness(body.business));
      toast.success("Identity details updated");
    } finally {
      setIdentitySubmitting(false);
    }
  }

  return (
    <div>
      <div className="border-b border-border pb-4">
        <div className="text-base font-semibold">Tax</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn GST off and every tax field disappears across the app.
        </p>
      </div>

      <fieldset disabled={readOnly} className="contents">
        <div
          className="mt-5 flex items-center justify-between rounded-lg border border-border p-4"
        >
          <Label htmlFor="gst-toggle" className="text-sm font-medium">
            Charge GST
          </Label>
          <Switch
            id="gst-toggle"
            checked={gstEnabled}
            disabled={readOnly}
            onCheckedChange={setGstEnabled}
          />
        </div>

        {gstEnabled && (
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="col-span-2 grid gap-2">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input
                id="gstin"
                placeholder="27AABCU9603R1ZX"
                className="font-mono uppercase"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                disabled={readOnly}
              />
              {errors.gstin && (
                <p className="text-sm text-destructive">{errors.gstin}</p>
              )}
            </div>
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
                disabled={readOnly}
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
                disabled={readOnly}
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
            <div className="col-span-2 grid gap-2">
              <Label htmlFor="place-of-supply">Place of supply</Label>
              <Select
                value={placeOfSupply}
                onValueChange={(value) => value && setPlaceOfSupply(value)}
                disabled={readOnly}
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

        {!readOnly && (
          <Button
            type="button"
            className="mt-6"
            disabled={submitting}
            onClick={handleSave}
          >
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        )}

        <div className="mt-8 border-t border-border pt-6">
          <div className="text-sm font-semibold">Identity registration numbers</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Shown in the document header, below GSTIN, when filled in —
            independent of whether GST is on.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="pan">PAN</Label>
              <Input
                id="pan"
                placeholder="ABCDE1234F"
                className="font-mono uppercase"
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">10 characters.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tan">TAN</Label>
              <Input
                id="tan"
                placeholder="ABCD12345E"
                className="font-mono uppercase"
                value={tan}
                onChange={(e) => setTan(e.target.value.toUpperCase())}
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">10 characters.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cin">CIN</Label>
              <Input
                id="cin"
                placeholder="U12345MH2020PTC123456"
                className="font-mono uppercase"
                value={cin}
                onChange={(e) => setCin(e.target.value.toUpperCase())}
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">21 characters.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="swift-code">SWIFT code</Label>
              <Input
                id="swift-code"
                placeholder="ABCDINBBXXX"
                className="font-mono uppercase"
                value={swiftCode}
                onChange={(e) => setSwiftCode(e.target.value.toUpperCase())}
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">8–11 characters.</p>
            </div>
          </div>
          {!readOnly && (
            <Button
              type="button"
              className="mt-6"
              disabled={identitySubmitting}
              onClick={handleIdentitySave}
            >
              {identitySubmitting ? "Saving…" : "Save changes"}
            </Button>
          )}
        </div>
      </fieldset>
    </div>
  );
}
