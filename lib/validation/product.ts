import { z } from "zod";

export const productCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(1000).optional(),
  sku: z.string().trim().max(100).optional(),
  unit: z.string().trim().max(50).optional(),
  price: z.number().min(0, "Price can't be negative"),
  gstRate: z.number().min(0).max(100).optional(),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;

export const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  sku: z.string().trim().max(100).nullable().optional(),
  unit: z.string().trim().max(50).nullable().optional(),
  price: z.number().min(0).optional(),
  gstRate: z.number().min(0).max(100).nullable().optional(),
});

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
