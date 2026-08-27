import type { Business, BusinessRole } from "@prisma/client";

// Decimal instances don't survive the Server -> Client Component
// boundary intact (see components/documents/types.ts for the same rule
// applied to products/line items) — gstDefaultRate is the one Decimal
// field on Business, so it's the one field that needs converting before
// this ever crosses into a client component.
export type SettingsBusiness = Omit<Business, "gstDefaultRate"> & {
  gstDefaultRate: number | null;
};

// Every PATCH response here comes back as JSON — Prisma's Decimal
// serializes to a string over the wire, not the number this app treats
// gstDefaultRate as everywhere else, so callers must convert explicitly
// rather than casting the raw response `as Business`.
export function toSettingsBusiness(
  raw: Omit<Business, "gstDefaultRate"> & { gstDefaultRate: unknown },
): SettingsBusiness {
  return {
    ...raw,
    gstDefaultRate:
      raw.gstDefaultRate == null ? null : Number(raw.gstDefaultRate),
  };
}

// No Decimal fields here — plain enough to pass to a Client Component as
// returned by the API, unlike SettingsBusiness above.
export type SettingsMember = {
  id: string;
  role: BusinessRole;
  title: string | null;
  reportsToId: string | null;
  isActive: boolean;
  user: { id: string; name: string | null; email: string };
};

export type SettingsInvitation = {
  id: string;
  email: string;
  role: BusinessRole;
  title: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: Date;
  expiresAt: Date;
};
