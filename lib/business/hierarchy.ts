// Pure tree logic over BusinessMember's reportsToId adjacency list — no
// Prisma, no database, no framework. See docs/hierarchy-access-control-
// design.md for the full design rationale. Two things this file
// deliberately does NOT do:
//   - It never looks at `title` or `role` — access is a function of tree
//     position only (design doc §0).
//   - It never trusts a caller-supplied "is this a cycle" answer — the
//     traversal itself is depth-capped so a cycle that somehow got past
//     write-time validation can't cause an infinite loop or silently
//     grant unbounded access (design doc §6).

export type MemberEdge = {
  id: string;
  userId: string;
  reportsToId: string | null;
};

// Org charts are shallow in practice; this is a generous ceiling that
// only exists to make a slipped-through cycle fail safe (stop) rather
// than loop forever or over-grant.
const MAX_HIERARCHY_DEPTH = 50;

// Self + every descendant's userId, reachable by walking `reportsToId`
// downward from `viewerMemberId`. This single function is the entire
// access rule for every tier in the requirement (Sales Executive,
// Manager, Senior Manager) — see design doc §0 for why one rule
// reproduces all of them.
export function resolveSubtreeUserIds(
  members: MemberEdge[],
  viewerMemberId: string,
): Set<string> {
  const byParent = new Map<string, MemberEdge[]>();
  for (const member of members) {
    if (member.reportsToId == null) continue;
    const siblings = byParent.get(member.reportsToId) ?? [];
    siblings.push(member);
    byParent.set(member.reportsToId, siblings);
  }
  const byId = new Map(members.map((m) => [m.id, m]));

  const viewer = byId.get(viewerMemberId);
  if (!viewer) return new Set();

  const result = new Set<string>([viewer.userId]);
  let frontier = [viewerMemberId];
  let depth = 0;

  while (frontier.length > 0 && depth < MAX_HIERARCHY_DEPTH) {
    const next: string[] = [];
    for (const parentId of frontier) {
      for (const child of byParent.get(parentId) ?? []) {
        if (result.has(child.userId)) continue; // already counted; also guards residual cycles
        result.add(child.userId);
        next.push(child.id);
      }
    }
    frontier = next;
    depth += 1;
  }

  return result;
}

// Would setting `memberId.reportsToId = proposedManagerId` create a
// cycle? Walks upward from the proposed manager; if it reaches
// `memberId`, the assignment would make memberId its own (indirect)
// ancestor. Also catches the trivial self-reference case directly.
export function wouldCreateCycle(
  members: MemberEdge[],
  memberId: string,
  proposedManagerId: string | null,
): boolean {
  if (proposedManagerId == null) return false;
  if (proposedManagerId === memberId) return true;

  const byId = new Map(members.map((m) => [m.id, m]));
  let current: string | null = proposedManagerId;
  let depth = 0;

  while (current != null && depth < MAX_HIERARCHY_DEPTH) {
    if (current === memberId) return true;
    current = byId.get(current)?.reportsToId ?? null;
    depth += 1;
  }

  return false;
}
