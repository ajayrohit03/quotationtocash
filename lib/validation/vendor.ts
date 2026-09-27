import { z } from "zod";
import { INDIAN_STATES } from "@/lib/constants/indian-states";

// Mirrors lib/validation/customer.ts's own optionalEmail transform —
// same "" -> undefined reasoning for an untouched optional field.
const optionalEmail = z
  .union([z.email("Enter a valid email"), z.literal("")])
  .optional()
  .transform((value) => (value ? value : undefined));

export const vendorCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: optionalEmail,
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.enum(INDIAN_STATES).optional(),
  // Soft UI hints only, same as customer/business identity fields
  // elsewhere — a formatting quibble shouldn't block saving a real
  // registration number the business already has correct.
  gstin: z.string().trim().max(20).optional(),
  pan: z.string().trim().max(20).optional(),
  cin: z.string().trim().max(30).optional(),
  bankName: z.string().trim().max(200).optional(),
  accountHolderName: z.string().trim().max(200).optional(),
  accountNumber: z.string().trim().max(40).optional(),
  ifscCode: z.string().trim().max(20).optional(),
  upiId: z.string().trim().max(100).optional(),
  swiftCode: z.string().trim().max(20).optional(),
});

export type VendorCreateInput = z.infer<typeof vendorCreateSchema>;
export type VendorCreateFormValues = z.input<typeof vendorCreateSchema>;

export const vendorUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: optionalEmail,
  phone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.enum(INDIAN_STATES).nullable().optional(),
  gstin: z.string().trim().max(20).nullable().optional(),
  pan: z.string().trim().max(20).nullable().optional(),
  cin: z.string().trim().max(30).nullable().optional(),
  bankName: z.string().trim().max(200).nullable().optional(),
  accountHolderName: z.string().trim().max(200).nullable().optional(),
  accountNumber: z.string().trim().max(40).nullable().optional(),
  ifscCode: z.string().trim().max(20).nullable().optional(),
  upiId: z.string().trim().max(100).nullable().optional(),
  swiftCode: z.string().trim().max(20).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type VendorUpdateInput = z.infer<typeof vendorUpdateSchema>;
export type VendorUpdateFormValues = z.input<typeof vendorUpdateSchema>;
