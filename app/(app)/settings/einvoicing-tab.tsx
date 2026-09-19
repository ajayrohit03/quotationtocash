"use client";

import { useState } from "react";
import { toast } from "sonner";
import { einvoicingSchema } from "@/lib/validation/business";
import { toSettingsBusiness, type SettingsBusiness } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Scaffolding only — see lib/einvoice/buildIrpPayload.ts's own comment.
// Nothing anywhere in this app makes a real IRP API call yet; this tab
// just collects and stores the credentials the follow-up integration
// session will need.
export function EinvoicingTab({
  business,
  readOnly,
  onUpdated,
}: {
  business: SettingsBusiness;
  readOnly: boolean;
  onUpdated: (business: SettingsBusiness) => void;
}) {
  const [einvoicingEnabled, setEinvoicingEnabled] = useState(
    business.einvoicingEnabled,
  );
  const [irpGstin, setIrpGstin] = useState(business.irpGstin ?? "");
  const [irpUsername, setIrpUsername] = useState(business.irpUsername ?? "");
  const [irpClientId, setIrpClientId] = useState(business.irpClientId ?? "");
  const [irpClientSecret, setIrpClientSecret] = useState(
    business.irpClientSecret ?? "",
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    // Belt-and-suspenders alongside the disabled inputs and the server's
    // own requireBusinessOwner() check — see business-profile-tab.tsx.
    if (readOnly) return;

    const parsed = einvoicingSchema.safeParse({
      einvoicingEnabled,
      irpGstin: irpGstin || null,
      irpUsername: irpUsername || null,
      irpClientId: irpClientId || null,
      irpClientSecret: irpClientSecret || null,
    });
    if (!parsed.success) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/business/einvoicing", {
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
      toast.success("E-invoicing settings updated");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="border-b border-border pb-4">
        <div className="text-base font-semibold">E-invoicing</div>
        <p className="mt-1 text-sm text-muted-foreground">
          IRN generation isn&apos;t live yet — this saves your IRP
          credentials for the API integration coming in a follow-up
          update.
        </p>
      </div>

      <fieldset disabled={readOnly} className="contents">
        <div className="mt-5 flex items-center justify-between rounded-lg border border-border p-4">
          <Label htmlFor="einvoicing-toggle" className="text-sm font-medium">
            Enable e-invoicing
          </Label>
          <Switch
            id="einvoicing-toggle"
            checked={einvoicingEnabled}
            disabled={readOnly}
            onCheckedChange={setEinvoicingEnabled}
          />
        </div>

        {einvoicingEnabled && (
          <>
            <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              These credentials come from einvoice1.gst.gov.in. Enable API
              access under your GSTIN before entering them here.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="col-span-2 grid gap-2">
                <Label htmlFor="irp-gstin">IRP GSTIN</Label>
                <Input
                  id="irp-gstin"
                  placeholder="27AABCU9603R1ZX"
                  className="font-mono uppercase"
                  value={irpGstin}
                  onChange={(e) => setIrpGstin(e.target.value.toUpperCase())}
                  disabled={readOnly}
                />
                <p className="text-xs text-muted-foreground">
                  Usually the same as your GSTIN under Tax — only differs if
                  e-invoicing is registered under a different GSTIN.
                </p>
              </div>
              <div className="col-span-2 grid gap-2">
                <Label htmlFor="irp-username">IRP username</Label>
                <Input
                  id="irp-username"
                  value={irpUsername}
                  onChange={(e) => setIrpUsername(e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="irp-client-id">IRP client ID</Label>
                <Input
                  id="irp-client-id"
                  className="font-mono"
                  value={irpClientId}
                  onChange={(e) => setIrpClientId(e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="irp-client-secret">IRP client secret</Label>
                <Input
                  id="irp-client-secret"
                  type="password"
                  className="font-mono"
                  value={irpClientSecret}
                  onChange={(e) => setIrpClientSecret(e.target.value)}
                  disabled={readOnly}
                />
              </div>
            </div>
          </>
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
      </fieldset>
    </div>
  );
}
