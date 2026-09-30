import { z } from "zod";

export const jobCreateSchema = z.object({
  jobRef: z.string().trim().min(1, "Job ref is required").max(100),
  description: z.string().trim().max(1000).optional(),
});

export type JobCreateInput = z.infer<typeof jobCreateSchema>;
export type JobCreateFormValues = z.input<typeof jobCreateSchema>;

export const jobUpdateSchema = z.object({
  jobRef: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(["open", "closed"]).optional(),
});

export type JobUpdateInput = z.infer<typeof jobUpdateSchema>;
export type JobUpdateFormValues = z.input<typeof jobUpdateSchema>;
