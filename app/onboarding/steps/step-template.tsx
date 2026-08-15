"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Business, DocumentTemplate } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StepShell } from "./step-shell";

const TEMPLATES: {
  id: DocumentTemplate;
  name: string;
  description: string;
}[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Traditional layout with a bold header band.",
  },
  {
    id: "modern",
    name: "Modern",
    description: "Clean lines, generous spacing, sans-serif focus.",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Just the essentials — no color blocks or rules.",
  },
];

function TemplatePreview({ id }: { id: DocumentTemplate }) {
  if (id === "classic") {
    return (
      <div className="flex h-full w-full flex-col gap-1.5 rounded-sm bg-white p-2.5 ring-1 ring-border">
        <div className="h-3 w-full rounded-[2px] bg-primary" />
        <div className="mt-1 h-1.5 w-2/3 rounded-[2px] bg-muted" />
        <div className="h-1.5 w-1/2 rounded-[2px] bg-muted" />
        <div className="mt-auto h-1.5 w-full rounded-[2px] bg-muted" />
      </div>
    );
  }
  if (id === "modern") {
    return (
      <div className="flex h-full w-full flex-col gap-1.5 rounded-sm bg-white p-2.5 ring-1 ring-border">
        <div className="flex items-center justify-between">
          <div className="size-2.5 rounded-full bg-primary" />
          <div className="h-1.5 w-1/3 rounded-[2px] bg-muted" />
        </div>
        <div className="mt-1.5 h-1.5 w-full rounded-[2px] bg-muted" />
        <div className="h-1.5 w-3/4 rounded-[2px] bg-muted" />
        <div className="mt-auto h-2 w-1/2 self-end rounded-[2px] bg-primary/70" />
      </div>
    );
  }
  return (
    <div className="flex h-full w-full flex-col gap-1.5 rounded-sm bg-white p-2.5 ring-1 ring-border">
      <div className="h-1.5 w-1/2 rounded-[2px] bg-muted" />
      <div className="mt-2 h-1 w-full rounded-[2px] bg-muted" />
      <div className="h-1 w-full rounded-[2px] bg-muted" />
      <div className="mt-auto h-1 w-1/3 self-end rounded-[2px] bg-muted" />
    </div>
  );
}

export function StepTemplate({
  business,
  onNext,
  onSkip,
}: {
  business: Business;
  onNext: (business: Business) => void;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<DocumentTemplate>(
    business.documentTemplate,
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentTemplate: selected }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't save your template. Try again.");
        return;
      }

      onNext(body.business as Business);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StepShell
      step={4}
      title="Pick a document style"
      description="Sets the default look for new quotations and invoices. You can switch templates any time from the document preview."
      onSkip={onSkip}
    >
      <div className="grid grid-cols-3 gap-4">
        {TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => setSelected(template.id)}
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
              selected === template.id
                ? "border-primary ring-1 ring-primary"
                : "border-border hover:border-foreground/30",
            )}
          >
            <div className="aspect-[3/4] w-full rounded-sm bg-muted p-1">
              <TemplatePreview id={template.id} />
            </div>
            <div>
              <p className="text-sm font-medium">{template.name}</p>
              <p className="text-xs text-muted-foreground">
                {template.description}
              </p>
            </div>
          </button>
        ))}
      </div>

      <Button
        type="button"
        className="mt-8"
        disabled={submitting}
        onClick={handleContinue}
      >
        {submitting ? "Saving…" : "Finish"}
      </Button>
    </StepShell>
  );
}
