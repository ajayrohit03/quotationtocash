import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

const createdUserIds: string[] = [];

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
  vi.resetModules();
});

async function createUser() {
  const user = await prisma.user.create({
    data: {
      email: `dismiss-tutorial-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_dismiss_tutorial_test_${randomUUID()}`,
      name: "Dismiss Tutorial Test User",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function mockedAuthAs(clerkUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as never);
}

function patchRequest(key: string) {
  return new NextRequest("http://localhost/api/user/dismiss-tutorial", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
}

describe("PATCH /api/user/dismiss-tutorial", () => {
  it("appends the key to the user's dismissedTutorials and persists it", async () => {
    const user = await createUser();
    await mockedAuthAs(user.authProviderId);

    const { PATCH } = await import("@/app/api/user/dismiss-tutorial/route");
    const response = await PATCH(patchRequest("dashboard"));
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.dismissedTutorials).toEqual(["dashboard"]);
  });

  it("is idempotent — dismissing an already-dismissed key is a no-op, not an error", async () => {
    const user = await createUser();
    await mockedAuthAs(user.authProviderId);

    const { PATCH } = await import("@/app/api/user/dismiss-tutorial/route");
    const first = await PATCH(patchRequest("quotations"));
    expect(first.status).toBe(200);
    const second = await PATCH(patchRequest("quotations"));
    expect(second.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.dismissedTutorials).toEqual(["quotations"]);
  });

  it("accumulates distinct keys across multiple screens", async () => {
    const user = await createUser();
    await mockedAuthAs(user.authProviderId);

    const { PATCH } = await import("@/app/api/user/dismiss-tutorial/route");
    await PATCH(patchRequest("dashboard"));
    await PATCH(patchRequest("customers"));

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.dismissedTutorials.sort()).toEqual(["customers", "dashboard"]);
  });

  it("rejects an unauthenticated request", async () => {
    const { auth } = await import("@clerk/nextjs/server");
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

    const { PATCH } = await import("@/app/api/user/dismiss-tutorial/route");
    const response = await PATCH(patchRequest("dashboard"));
    expect(response.status).toBe(401);
  });
});
