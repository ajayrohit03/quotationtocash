import { z } from "zod";

export const jobCreateSchema = z.object({
  jobRef: z.string().trim().min(1, "Job ref is required").max(100),
  description: z.string().trim().max(1000).optional(),
  // A default/pre-fill rate for new FC line items on documents and
  // purchase invoices linked to this job — not an override of
  // anything already saved. See schema.prisma's Job.exchangeRate
  // comment; the builders only ever copy this value in once, at the
  // moment a line is created or a job is first selected, never read
  // it live at render/save time.
  exchangeRate: z.number().positive().nullable().optional(),
});

export type JobCreateInput = z.infer<typeof jobCreateSchema>;
export type JobCreateFormValues = z.input<typeof jobCreateSchema>;

export const jobUpdateSchema = z.object({
  jobRef: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(["open", "closed"]).optional(),
  exchangeRate: z.number().positive().nullable().optional(),
});

export type JobUpdateInput = z.infer<typeof jobUpdateSchema>;
export type JobUpdateFormValues = z.input<typeof jobUpdateSchema>;
