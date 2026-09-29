import { z } from "zod";

// See docs/accounts-payable-phase1-design.md §7 — field-for-field the
// same shape as lib/validation/payment.ts's paymentCreateSchema.
// `amount` has no upper bound: overpayment is allowed and becomes a
// tracked credit balance, not rejected or clamped.
export const vendorPaymentCreateSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  paidAt: z.coerce.date().optional(),
  method: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
});

export type VendorPaymentCreateInput = z.infer<typeof vendorPaymentCreateSchema>;
