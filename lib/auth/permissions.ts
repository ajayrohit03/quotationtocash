import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { ForbiddenError } from "@/lib/auth/errors";
import { requireBusiness, type BusinessContext } from "@/lib/auth/session";

// See docs/permission-layer-design.md — permission (what) and scope
// (which records) are two independent axes. This module owns the "what"
// only; scope lives alongside document/customer/product visibility
// where it's always lived (lib/documents/visibility.ts).
export const PERMISSIONS = [
  "quotations.view", "quotations.create", "quotations.edit", "quotations.delete",
  "invoices.view", "invoices.create", "invoices.edit", "invoices.delete",
  "customers.view", "customers.create", "customers.edit", "customers.delete",
  "products.view", "products.create", "products.edit", "products.delete",
  "reports.view",
  "users.manage",
  "organization.manage",
  "organization.tax",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const STAFF_PERMISSIONS: readonly Permission[] = [
  "quotations.view", "quotations.create", "quotations.edit", "quotations.delete",
  "invoices.view", "invoices.create", "invoices.edit", "invoices.delete",
  "customers.view", "customers.create", "customers.edit", "customers.delete",
  "products.view", "products.create", "products.edit", "products.delete",
];

// The only permission Manager adds on top of Staff's set (design doc §0)
// — every other capability Manager has over documents comes from a wider
// *scope* on a permission Staff already holds, not a new permission.
const MANAGER_ONLY_PERMISSIONS: readonly Permission[] = ["reports.view"];

// Named, explicit, and the one place to add the next exclusion — not a
// prose comment to rediscover later. When a billing feature exists, its
// permission goes here. When ownership-transfer/remove-owner exists as a
// real action, its permission goes here too. Neither exists yet, so
// neither gets a catalog entry — don't add permission strings for
// actions that don't exist. Keep this comment current when either ships.
const ADMIN_EXCLUDED_PERMISSIONS: readonly Permission[] = ["organization.tax"];

// Derived, not a stored role — computed live from reportsToId every
// time, memoized per-request (React cache(), same pattern as
// requireBusiness() itself) so multiple permission checks in one request
// don't repeat the query. Never persisted anywhere else, so it can never
// drift out of sync with the data it's derived from — there's no second
// copy of "is Manager" to go stale. See docs/permission-layer-design.md
// §4.
export const isManager = cache(async (membershipId: string): Promise<boolean> => {
  const directReportCount = await prisma.businessMember.count({
    where: { reportsToId: membershipId, isActive: true },
  });
  return directReportCount > 0;
});

export async function hasPermission(
  context: BusinessContext,
  permission: Permission,
): Promise<boolean> {
  const { role } = context.membership;

  if (role === "owner") return true;
  if (role === "admin") return !ADMIN_EXCLUDED_PERMISSIONS.includes(permission);

  // role === "staff" — Owner and Admin never reach here, so isManager()'s
  // extra query is only ever paid by the population it matters for.
  if (STAFF_PERMISSIONS.includes(permission)) return true;
  if (MANAGER_ONLY_PERMISSIONS.includes(permission)) {
    return isManager(context.membership.id);
  }
  return false;
}

// The single central resolver every permission-gated route should call —
// requireBusinessOwner()/requireBusinessAdmin() remain the coarser
// siblings for checks that were never really per-record permission
// questions (GST, Team-membership editing itself). This is the
// finer-grained one for anything that maps to a catalog entry.
export async function requirePermission(
  permission: Permission,
): Promise<BusinessContext> {
  const context = await requireBusiness();
  if (!(await hasPermission(context, permission))) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
  return context;
}
