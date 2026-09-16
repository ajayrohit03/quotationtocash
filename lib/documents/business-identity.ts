import type { BusinessSnapshot } from "@/lib/documents/snapshots";

// Shared between DocumentRender (web preview/public share) and
// document-pdf.tsx (React-PDF) so both renderers show identical text —
// same reasoning as bankDetailsLine/paymentDetailsLines in
// lib/documents/payment-details.ts. Returns null when none of the four
// fields are set, so the header's identity line is skipped entirely
// rather than showing an empty line.
export function businessIdentityLine(business: BusinessSnapshot): string | null {
  const parts: string[] = [];
  if (business.pan) parts.push(`PAN ${business.pan}`);
  if (business.tan) parts.push(`TAN ${business.tan}`);
  if (business.cin) parts.push(`CIN ${business.cin}`);
  if (business.swiftCode) parts.push(`SWIFT ${business.swiftCode}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
