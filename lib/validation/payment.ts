import { z } from "zod";

// See docs/payment-tracking-design.md §2. `amount` has no upper bound —
// overpayment is allowed and becomes a tracked credit balance, not
// rejected or clamped.
export const paymentCreateSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  paidAt: z.coerce.date().optional(),
  note: z.string().trim().max(500).optional(),
});

export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
