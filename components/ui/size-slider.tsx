"use client";

import type { AssetSize } from "@prisma/client";

const STEPS: readonly AssetSize[] = ["sm", "md", "lg", "xl"];
const LABELS: Record<AssetSize, string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
  xl: "X-Large",
};

// A 4-step slider for Business.logoSize/signatureSize (see
// lib/documents/asset-size.ts) — plain native <input type="range">,
// same pattern as the Customize sidebar's own FONT SIZE slider
// (document-preview.tsx), rather than a new dependency for something
// this simple.
export function SizeSlider({
  value,
  onChange,
  disabled,
}: {
  value: AssetSize;
  onChange: (value: AssetSize) => void;
  disabled?: boolean;
}) {
  const index = STEPS.indexOf(value);
  return (
    <div>
      <input
        type="range"
        min={0}
        max={STEPS.length - 1}
        step={1}
        disabled={disabled}
        value={index}
        onChange={(e) => onChange(STEPS[Number(e.target.value)])}
        className="w-full accent-primary disabled:cursor-not-allowed"
      />
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        {STEPS.map((step) => (
          <span key={step}>{LABELS[step]}</span>
        ))}
      </div>
    </div>
  );
}
