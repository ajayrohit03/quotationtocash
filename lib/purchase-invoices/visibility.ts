import "server-only";

import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireBusiness } from "@/lib/auth/session";
import { resolveSubtreeUserIds } from "@/lib/business/hierarchy";
import type { ScopeAction } from "@/lib/documents/visibility";

// Same two-tier view/mutate hierarchy-scoping as
// lib/documents/visibility.ts's documentScopeWhere — the hierarchy-
// visibility concept is document-type-agnostic (design doc §8), only
// the Prisma model being filtered changes.
const resolveVisibleUserIds = cache(async function resolveVisibleUserIds(
  businessId: string,
  viewerUserId: string,
): Promise<Set<string>> {
  const members = await prisma.businessMember.findMany({
    where: { businessId },
    select: { id: true, userId: true, reportsToId: true },
  });

  const viewer = members.find((m) => m.userId === viewerUserId);
  if (!viewer) return new Set();

  return resolveSubtreeUserIds(members, viewer.id);
});

export async function purchaseInvoiceScopeWhere(
  action: ScopeAction,
): Promise<Prisma.PurchaseInvoiceWhereInput> {
  const { business, membership, user } = await requireBusiness();

  if (membership.role === "owner" || membership.role === "admin") {
    return {};
  }

  if (action === "mutate") {
    return { createdByUserId: user.id };
  }

  const visibleUserIds = await resolveVisibleUserIds(business.id, user.id);

  return {
    OR: [
      { createdByUserId: null },
      { createdByUserId: { in: Array.from(visibleUserIds) } },
    ],
  };
}
