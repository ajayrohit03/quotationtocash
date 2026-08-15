import { z } from "zod";
import { INDIAN_STATES } from "@/lib/constants/indian-states";

// Forms submit "" for an untouched optional email field; treat that as
// absent rather than failing z.email()'s format check.
const optionalEmail = z
  .union([z.email("Enter a valid email"), z.literal("")])
  .optional()
  .transform((value) => (value ? value : undefined));

export const customerCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  company: z.string().trim().max(200).optional(),
  email: optionalEmail,
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.enum(INDIAN_STATES).optional(),
});

// The schema's email field is a z.transform (empty string -> undefined),
// so its input type (what react-hook-form manages) differs from its
// output type (what actually gets sent). Forms must use the *Form type.
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerCreateFormValues = z.input<typeof customerCreateSchema>;

export const customerUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  company: z.string().trim().max(200).nullable().optional(),
  email: optionalEmail,
  phone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.enum(INDIAN_STATES).nullable().optional(),
});

export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
