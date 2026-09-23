// "Round total" (see Document.roundTotal's schema comment) — a tiny,
// pure, Decimal-free function deliberately shared between the PATCH
// route (which persists the result into Document.total/roundingAdjustment)
// and the web/PDF renderers (which call it live, against the toggle's
// *current* value, so the Customize sidebar's switch updates GRAND TOTAL
// instantly instead of waiting for the debounced autosave to land — see
// schema.prisma's own comment on why the renderers don't just trust the
// persisted roundingAdjustment column directly).
export function applyRounding(
  rawTotal: number,
  roundTotal: boolean,
): { total: number; roundingAdjustment: number } {
  if (!roundTotal) {
    return { total: rawTotal, roundingAdjustment: 0 };
  }
  const rounded = Math.round(rawTotal);
  // Rounded to 2dp to avoid a stray floating-point tail (e.g.
  // 232114 - 232114.31 = -0.30999999999994907) leaking into the
  // formatted "Rounding" line.
  const roundingAdjustment = Math.round((rounded - rawTotal) * 100) / 100;
  return { total: rounded, roundingAdjustment };
}
