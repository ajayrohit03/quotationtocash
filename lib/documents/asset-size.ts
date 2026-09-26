import type { AssetSize } from "@prisma/client";

// Business.logoSize/signatureSize's rendered-size multiplier — "md" is
// each image's own existing baseline size in both document-render.tsx
// (the web preview's CSS h-10/max-w-160px) and document-pdf.tsx (60x60
// logo, 80x40 signature); sm/lg/xl scale relative to that baseline.
// Shared between both renderers since it's pure data with no framework
// dependency — unlike DEFAULT_FONT_SIZE, which stays hand-duplicated in
// each file because one side is a CSS custom property and the other a
// literal point multiplication (see document-pdf.tsx's own comment).
export const ASSET_SIZE_SCALE: Record<AssetSize, number> = {
  sm: 0.75,
  md: 1,
  lg: 1.333,
  xl: 1.75,
};
