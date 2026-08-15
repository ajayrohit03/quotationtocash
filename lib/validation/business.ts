import { z } from "zod";

export const businessCreateSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(200),
  email: z.email("Enter a valid email"),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  website: z.string().trim().max(300).optional(),
});

export type BusinessCreateInput = z.infer<typeof businessCreateSchema>;

export const businessUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.email().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  website: z.string().trim().max(300).nullable().optional(),
  logoUrl: z.string().trim().max(2000).nullable().optional(),

  gstEnabled: z.boolean().optional(),
  gstin: z.string().trim().max(20).nullable().optional(),
  gstDefaultRate: z.number().min(0).max(100).nullable().optional(),
  placeOfSupply: z.string().trim().max(120).nullable().optional(),
  registrationType: z.string().trim().max(120).nullable().optional(),

  documentTemplate: z.enum(["classic", "modern", "minimal"]).optional(),
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #4F46E5")
    .optional(),
});

export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;
