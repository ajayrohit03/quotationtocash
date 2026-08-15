"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import type { Business } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { StepShell } from "./step-shell";

export function StepLogo({
  business,
  onNext,
  onSkip,
}: {
  business: Business;
  onNext: (business: Business) => void;
  onSkip: () => void;
}) {
  const [current, setCurrent] = useState(business);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
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

      setCurrent(body.business as Business);
      toast.success("Logo uploaded");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      const response = await fetch("/api/business/logo", { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't remove logo. Try again.");
        return;
      }
      setCurrent(body.business as Business);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <StepShell
      step={2}
      title="Add your logo"
      description="Shown on your quotations and invoices. Optional — you can add or change it later in Settings."
      onSkip={onSkip}
    >
      <div className="flex items-center gap-6">
        <div className="flex size-28 flex-none items-center justify-center overflow-hidden rounded-xl border border-dashed border-input bg-muted">
          {current.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
            <img
              src={current.logoUrl}
              alt="Business logo"
              className="size-full object-contain"
            />
          ) : (
            <span className="font-mono text-[10px] text-muted-foreground">
              No logo
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploading || removing}
            onClick={() => inputRef.current?.click()}
          >
            {uploading
              ? "Uploading…"
              : current.logoUrl
                ? "Replace logo"
                : "Upload logo"}
          </Button>
          {current.logoUrl && (
            <Button
              type="button"
              variant="ghost"
              disabled={uploading || removing}
              onClick={handleRemove}
            >
              {removing ? "Removing…" : "Remove logo"}
            </Button>
          )}
        </div>
      </div>

      <Button
        type="button"
        className="mt-8"
        disabled={uploading || removing}
        onClick={() => onNext(current)}
      >
        Continue
      </Button>
    </StepShell>
  );
}
