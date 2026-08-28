import "server-only";

import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireBusiness } from "@/lib/auth/session";
import { resolveSubtreeUserIds } from "@/lib/business/hierarchy";

// The single place that turns "who is asking" into "which documents they
// may act on" — every document-touching route/page should build its
// Prisma `where` through this, the same way every query in this app
// already threads `businessId` through rather than fetching by id alone.
// See docs/hierarchy-access-control-design.md for the full rationale, and
// docs/invitation-onboarding-design.md §1.3 for why admin joins owner
// here; in short:
//   - role = owner or admin sees everything (hierarchy doc §7 Fork B
//     Option A; invitation doc §1.3 extends it to admin) — both already-
//     hardened, unconditional.
//   - everyone else sees documents they created, or created by anyone in
//     their reporting subtree (§0), or documents with no creator at all
//     (createdByUserId IS NULL — pre-hierarchy legacy data, deliberately
//     never backfilled, see §3).
export type DocumentVisibility = {
  businessId: string;
  seesAllDocuments: boolean;
  viewerUserId: string;
};

export async function getDocumentVisibility(): Promise<DocumentVisibility> {
  const { business, membership, user } = await requireBusiness();

  if (membership.role === "owner" || membership.role === "admin") {
    return {
      businessId: business.id,
      seesAllDocuments: true,
      viewerUserId: user.id,
    };
  }

  return {
    businessId: business.id,
    seesAllDocuments: false,
    viewerUserId: user.id,
  };
}

// Resolves the actual set of visible userIds for a non-owner viewer.
// Deliberately fetches every BusinessMember for the business (not just
// "active" ones) — a deactivated member's historical documents must stay
// visible to whoever now sits above their old position (§5); excluding
// them here would silently break that.
//
// Wrapped in React's cache() — same reasoning as requireBusiness() in
// lib/auth/session.ts: multiple documentScopeWhere("view") calls within
// one request (e.g. dashboard's metrics + recent-documents, run in
// parallel) would otherwise each independently re-fetch every
// BusinessMember row for the business.
const resolveVisibleUserIds = cache(async function resolveVisibleUserIds(
  businessId: string,
  viewerUserId: string,
): Promise<Set<string>> {
  const members = await prisma.businessMember.findMany({
    where: { businessId },
    select: { id: true, userId: true, reportsToId: true },
  });

  const viewer = members.find((m) => m.userId === viewerUserId);
  if (!viewer) {
    // Shouldn't happen (requireBusiness() already proved membership),
    // but fail closed rather than open if it somehow does.
    return new Set();
  }

  return resolveSubtreeUserIds(members, viewer.id);
});

// Two scope tiers, not one shared tier — see
// docs/permission-layer-design.md §5. "view" is the original hierarchy
// feature's subtree logic, unchanged. "mutate" is deliberately narrower:
// own documents only, full stop, even for a Manager with a real subtree.
// Team scope never applies directly to a write, for anyone — the
// reassignment action (POST /api/documents/[id]/reassign) is the sole
// bridge from "I can see it" to "I can edit it," specifically so a
// Manager editing a subordinate's document is always an explicit,
// visible, single act of taking ownership, never an ambient grant. This
// fixes a real gap: every mutating document route used to share this
// exact function with the view routes, which silently gave anyone with a
// direct report full edit/delete/mark-paid/send/convert access to their
// entire subtree — never a reviewed decision, just a side effect of
// reusing one function everywhere.
export type ScopeAction = "view" | "mutate";

export async function documentScopeWhere(
  action: ScopeAction,
): Promise<Prisma.DocumentWhereInput> {
  const visibility = await getDocumentVisibility();
  if (visibility.seesAllDocuments) return {};

  if (action === "mutate") {
    return { createdByUserId: visibility.viewerUserId };
  }

  const visibleUserIds = await resolveVisibleUserIds(
    visibility.businessId,
    visibility.viewerUserId,
  );

  return {
    OR: [
      { createdByUserId: null },
      { createdByUserId: { in: Array.from(visibleUserIds) } },
    ],
  };
}
