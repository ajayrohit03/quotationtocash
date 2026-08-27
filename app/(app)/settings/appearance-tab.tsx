"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { DocumentTemplate } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toSettingsBusiness, type SettingsBusiness } from "./types";

const TEMPLATES: { id: DocumentTemplate; label: string; description: string }[] = [
  { id: "classic", label: "Classic", description: "Traditional layout with a bold header band." },
  { id: "modern", label: "Modern", description: "Clean lines, generous spacing, sans-serif focus." },
  { id: "minimal", label: "Minimal", description: "Just the essentials — no color blocks or rules." },
];

const SWATCHES = ["#4F46E5", "#0F766E", "#1D4ED8", "#C2410C", "#111827"];

export function AppearanceTab({
  business,
  readOnly,
  onUpdated,
}: {
  business: SettingsBusiness;
  readOnly: boolean;
  onUpdated: (business: SettingsBusiness) => void;
}) {
  const [template, setTemplate] = useState(business.documentTemplate);
  const [accentColor, setAccentColor] = useState(business.accentColor);
  const [submitting, setSubmitting] = useState(false);

  const dirty = template !== business.documentTemplate || accentColor !== business.accentColor;

  async function handleSave() {
    // Belt-and-suspenders alongside the disabled swatch/template buttons
    // and the server's own requireBusinessAdmin() check — see
    // business-profile-tab.tsx. Unreachable through the UI today (no
    // Save button renders when readOnly), but keeps this tab consistent
    // with the others rather than being the one exception.
    if (readOnly) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentTemplate: template, accentColor }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't save. Try again.");
        return;
      }
      onUpdated(toSettingsBusiness(body.business));
      toast.success("Appearance updated");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="border-b border-border pb-4">
        <div className="text-base font-semibold">Appearance</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Applies to new documents and the PDF export — existing sent
          documents keep whatever they were created with.
        </p>
      </div>

      <fieldset disabled={readOnly} className="contents">
        <div className="mt-6 text-xs font-semibold tracking-wide text-muted-foreground">
          ACCENT COLOR
        </div>
        <div className="mt-2.5 flex gap-2.5">
          {SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              disabled={readOnly}
              aria-label={`Use ${color} as accent color`}
              onClick={() => setAccentColor(color)}
              className={cn(
                "size-8 rounded-md disabled:cursor-not-allowed",
                accentColor === color && "ring-2 ring-offset-2 ring-offset-background",
              )}
              style={{
                background: color,
                ...(accentColor === color
                  ? ({ "--tw-ring-color": color } as React.CSSProperties)
                  : {}),
              }}
            />
          ))}
        </div>

        <div className="mt-6 text-xs font-semibold tracking-wide text-muted-foreground">
          TEMPLATE
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={readOnly}
              onClick={() => setTemplate(t.id)}
              className={cn(
                "rounded-lg border p-3 text-left text-sm transition-colors disabled:cursor-not-allowed",
                template === t.id
                  ? "border-primary ring-1 ring-primary"
                  : "border-border hover:border-foreground/30",
              )}
            >
              <div className="font-medium">{t.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {t.description}
              </div>
            </button>
          ))}
        </div>

        {!readOnly && (
          <Button
            type="button"
            className="mt-6"
            disabled={submitting || !dirty}
            onClick={handleSave}
          >
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        )}
      </fieldset>
    </div>
  );
}
