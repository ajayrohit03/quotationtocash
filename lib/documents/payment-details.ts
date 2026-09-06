import type { BusinessSnapshot } from "@/lib/documents/snapshots";

// Shared between DocumentRender (web preview/public share) and
// document-pdf.tsx (React-PDF) so both renderers show identical text —
// extracted once rather than duplicating the same join logic twice.
// Returns null when no bank field is set at all, so the PAYMENT DETAILS
// block's second line is skipped entirely rather than showing an empty
// or all-fallback line. accountHolderName defaults to the business name
// once at least one other bank field is present — never shown as a
// standalone default when nothing else was filled in.
export function bankDetailsLine(business: BusinessSnapshot): string | null {
  const hasAnyBankField = Boolean(
    business.bankName ||
      business.accountHolderName ||
      business.accountNumber ||
      business.ifscCode ||
      business.upiId,
  );
  if (!hasAnyBankField) return null;

  const parts: string[] = [];
  if (business.bankName) parts.push(`Bank: ${business.bankName}`);
  parts.push(`Account holder: ${business.accountHolderName || business.name}`);
  if (business.accountNumber) parts.push(`Account: ${business.accountNumber}`);
  if (business.ifscCode) parts.push(`IFSC: ${business.ifscCode}`);
  if (business.upiId) parts.push(`UPI: ${business.upiId}`);
  return parts.join(" · ");
}
