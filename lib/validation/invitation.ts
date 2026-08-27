import { z } from "zod";

// role is never "owner" at the type level — there is exactly one Owner,
// set at business creation (see docs/invitation-onboarding-design.md
// §4.1).
export const invitationCreateSchema = z.object({
  email: z.email("Enter a valid email"),
  role: z.enum(["staff", "admin"]),
  title: z.string().trim().max(120).nullable().optional(),
  reportsToId: z.string().nullable().optional(),
});

export type InvitationCreateInput = z.infer<typeof invitationCreateSchema>;

// Accept/decline can be keyed either by the raw emailed token (the public
// /invite/[token] page, reachable pre-auth) or by invitation id (the
// already-authenticated "arrived without the link" interstitial) — see
// lib/invitations/service.ts's InvitationSelector for why both are safe.
export const invitationActionSchema = z.union([
  z.object({ token: z.string().min(1) }),
  z.object({ id: z.string().min(1) }),
]);

export type InvitationActionInput = z.infer<typeof invitationActionSchema>;
