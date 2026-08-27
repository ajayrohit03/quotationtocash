import { z } from "zod";

// Never "owner" — there is exactly one Owner, set at business creation
// and not transferable through this route (see
// docs/invitation-onboarding-design.md §1.1, §5).
export const memberUpdateSchema = z.object({
  role: z.enum(["staff", "admin"]).optional(),
  title: z.string().trim().max(120).nullable().optional(),
  reportsToId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;
