import type { BusinessSnapshot } from "@/lib/documents/snapshots";

export type PaymentDetailsLine = { label: string; value: string };

// Shared between DocumentRender (web preview/public share) and
// document-pdf.tsx (React-PDF) so both renderers show identical content
// for the PAYMENT DETAILS block — extracted once rather than duplicating
// this logic per surface. Returns [] when no bank field is set at all,
// so the block's bank-detail lines are skipped entirely rather than
// showing an empty or all-fallback line. accountHolderName defaults to
// the business name once at least one other bank field is present —
// never shown as a standalone default when nothing else was filled in.
export function paymentDetailsLines(business: BusinessSnapshot): PaymentDetailsLine[] {
  const hasAnyBankField = Boolean(
    business.bankName ||
      business.accountHolderName ||
      business.accountNumber ||
      business.ifscCode ||
      business.upiId,
  );
  if (!hasAnyBankField) return [];

  const lines: PaymentDetailsLine[] = [];
  if (business.bankName) lines.push({ label: "Bank", value: business.bankName });
  lines.push({
    label: "Account holder",
    value: business.accountHolderName || business.name,
  });
  if (business.accountNumber) {
    lines.push({ label: "Account number", value: business.accountNumber });
  }
  if (business.ifscCode) lines.push({ label: "IFSC", value: business.ifscCode });
  if (business.upiId) lines.push({ label: "UPI", value: business.upiId });
  return lines;
}
