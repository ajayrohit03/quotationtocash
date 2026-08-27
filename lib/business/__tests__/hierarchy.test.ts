import { describe, expect, it } from "vitest";
import {
  resolveSubtreeUserIds,
  wouldCreateCycle,
  type MemberEdge,
} from "@/lib/business/hierarchy";

// Mirrors the example org chart from the design doc:
//   ceo
//   ├── seniorA
//   │   ├── mgrA1
//   │   │   ├── se1
//   │   │   ├── se2
//   │   │   └── se3
//   │   └── se4 (direct report of seniorA, no manager in between)
//   └── seniorB
//       └── mgrB1
//           ├── se5
//           └── se6
const ORG: MemberEdge[] = [
  { id: "ceo", userId: "u-ceo", reportsToId: null },
  { id: "seniorA", userId: "u-seniorA", reportsToId: "ceo" },
  { id: "seniorB", userId: "u-seniorB", reportsToId: "ceo" },
  { id: "mgrA1", userId: "u-mgrA1", reportsToId: "seniorA" },
  { id: "se4", userId: "u-se4", reportsToId: "seniorA" },
  { id: "se1", userId: "u-se1", reportsToId: "mgrA1" },
  { id: "se2", userId: "u-se2", reportsToId: "mgrA1" },
  { id: "se3", userId: "u-se3", reportsToId: "mgrA1" },
  { id: "mgrB1", userId: "u-mgrB1", reportsToId: "seniorB" },
  { id: "se5", userId: "u-se5", reportsToId: "mgrB1" },
  { id: "se6", userId: "u-se6", reportsToId: "mgrB1" },
];

describe("resolveSubtreeUserIds", () => {
  it("a leaf Sales Executive sees only themselves", () => {
    expect(resolveSubtreeUserIds(ORG, "se1")).toEqual(new Set(["u-se1"]));
  });

  it("a Manager sees themselves + their direct Sales Executives, not the sibling branch", () => {
    const subtree = resolveSubtreeUserIds(ORG, "mgrA1");
    expect(subtree).toEqual(
      new Set(["u-mgrA1", "u-se1", "u-se2", "u-se3"]),
    );
    expect(subtree.has("u-se5")).toBe(false); // mgrB1's report — different branch
  });

  it("a Senior Manager sees their entire downward subtree, not the sibling Senior Manager's", () => {
    const subtree = resolveSubtreeUserIds(ORG, "seniorA");
    expect(subtree).toEqual(
      new Set(["u-seniorA", "u-mgrA1", "u-se4", "u-se1", "u-se2", "u-se3"]),
    );
    expect(subtree.has("u-seniorB")).toBe(false);
    expect(subtree.has("u-mgrB1")).toBe(false);
    expect(subtree.has("u-se5")).toBe(false);
  });

  it("the root's subtree is the whole company", () => {
    const subtree = resolveSubtreeUserIds(ORG, "ceo");
    expect(subtree.size).toBe(ORG.length);
    for (const member of ORG) {
      expect(subtree.has(member.userId)).toBe(true);
    }
  });

  it("two people with the same title (Manager) get different subtrees based on actual position", () => {
    // The whole point of the design: mgrA1 and mgrB1 share a title but
    // must never see each other's reports.
    const mgrA1Subtree = resolveSubtreeUserIds(ORG, "mgrA1");
    const mgrB1Subtree = resolveSubtreeUserIds(ORG, "mgrB1");
    expect(mgrA1Subtree.has("u-se5")).toBe(false);
    expect(mgrA1Subtree.has("u-se6")).toBe(false);
    expect(mgrB1Subtree.has("u-se1")).toBe(false);
    expect(mgrB1Subtree.has("u-se2")).toBe(false);
    expect(mgrB1Subtree.has("u-se3")).toBe(false);
  });

  it("a member with no direct reports and reportsToId null (an unconnected root) sees only themselves", () => {
    const isolated: MemberEdge[] = [
      ...ORG,
      { id: "cofounder", userId: "u-cofounder", reportsToId: null },
    ];
    // A second, unrelated root must NOT inherit the first root's subtree
    // just by both having reportsToId = null (design doc §7 — this is
    // exactly why "sees everything" is not inferred from being a root).
    expect(resolveSubtreeUserIds(isolated, "cofounder")).toEqual(
      new Set(["u-cofounder"]),
    );
  });

  it("returns an empty set for a viewer id that isn't in the member list", () => {
    expect(resolveSubtreeUserIds(ORG, "nonexistent")).toEqual(new Set());
  });

  it("does not loop forever or over-grant if a cycle somehow exists in the data", () => {
    // Should never be writable via wouldCreateCycle, but the traversal
    // itself must still fail safe if bad data exists regardless.
    const cyclic: MemberEdge[] = [
      { id: "a", userId: "u-a", reportsToId: "b" },
      { id: "b", userId: "u-b", reportsToId: "a" },
    ];
    const result = resolveSubtreeUserIds(cyclic, "a");
    expect(result).toEqual(new Set(["u-a", "u-b"]));
  });

  it("handles a long chain without exceeding the depth cap", () => {
    const chain: MemberEdge[] = Array.from({ length: 30 }, (_, i) => ({
      id: `n${i}`,
      userId: `u${i}`,
      reportsToId: i === 0 ? null : `n${i - 1}`,
    }));
    const subtree = resolveSubtreeUserIds(chain, "n0");
    expect(subtree.size).toBe(30);
  });
});

describe("wouldCreateCycle", () => {
  it("is false for a perfectly normal reassignment", () => {
    expect(wouldCreateCycle(ORG, "se1", "mgrB1")).toBe(false);
  });

  it("is true for a direct self-reference", () => {
    expect(wouldCreateCycle(ORG, "mgrA1", "mgrA1")).toBe(true);
  });

  it("is true when reassigning a manager to one of their own direct reports", () => {
    // mgrA1 -> se1 would make mgrA1 an indirect report of themselves.
    expect(wouldCreateCycle(ORG, "mgrA1", "se1")).toBe(true);
  });

  it("is true when reassigning to any indirect descendant, not just a direct one", () => {
    // seniorA -> se1 (se1 is two levels below seniorA via mgrA1).
    expect(wouldCreateCycle(ORG, "seniorA", "se1")).toBe(true);
  });

  it("is false when reassigning upward or sideways in the tree", () => {
    expect(wouldCreateCycle(ORG, "se1", "seniorB")).toBe(false);
    expect(wouldCreateCycle(ORG, "mgrA1", "seniorB")).toBe(false);
  });

  it("is false when clearing a manager (reportsToId -> null)", () => {
    expect(wouldCreateCycle(ORG, "mgrA1", null)).toBe(false);
  });
});
