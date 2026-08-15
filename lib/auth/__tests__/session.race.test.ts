import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { findOrCreateUserForIdentity } from "@/lib/auth/user-identity";

// Exercises findOrCreateUserForIdentity against the real database (no
// mocking Prisma — the whole point is to prove the unique-constraint
// recovery path actually works against Postgres, not just against our
// assumptions about it). Every row this file creates is deleted in
// afterEach so it never leaves test data behind.
const createdEmails: string[] = [];

afterEach(async () => {
  if (createdEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    createdEmails.length = 0;
  }
});

describe("findOrCreateUserForIdentity", () => {
  it("creates exactly one row when called concurrently for the same identity", async () => {
    const clerkUserId = `user_race_test_${randomUUID()}`;
    const email = `race-test-${randomUUID()}@example.invalid`;
    createdEmails.push(email);

    const identity = {
      clerkUserId,
      email,
      emailVerified: true,
      name: "Race Test",
      avatarUrl: null,
    };

    // Two "requests" racing to provision the same brand-new identity —
    // this is the Link-prefetch-vs-real-navigation scenario.
    const [a, b] = await Promise.all([
      findOrCreateUserForIdentity(identity),
      findOrCreateUserForIdentity(identity),
    ]);

    expect(a.id).toBe(b.id);
    expect(a.authProviderId).toBe(clerkUserId);
    expect(a.email).toBe(email);

    const rows = await prisma.user.findMany({ where: { email } });
    expect(rows).toHaveLength(1);
  });

  it("re-links an existing row when the same verified email resurfaces under a new authProviderId", async () => {
    const email = `race-test-${randomUUID()}@example.invalid`;
    createdEmails.push(email);
    const originalClerkUserId = `user_race_test_${randomUUID()}`;
    const newClerkUserId = `user_race_test_${randomUUID()}`;

    const original = await findOrCreateUserForIdentity({
      clerkUserId: originalClerkUserId,
      email,
      emailVerified: true,
      name: "Original",
      avatarUrl: null,
    });

    const relinked = await findOrCreateUserForIdentity({
      clerkUserId: newClerkUserId,
      email,
      emailVerified: true,
      name: "Recreated Account",
      avatarUrl: null,
    });

    expect(relinked.id).toBe(original.id);
    expect(relinked.authProviderId).toBe(newClerkUserId);

    const rows = await prisma.user.findMany({ where: { email } });
    expect(rows).toHaveLength(1);
  });

  it("refuses to re-link when the email isn't verified on the new session", async () => {
    const email = `race-test-${randomUUID()}@example.invalid`;
    createdEmails.push(email);
    const originalClerkUserId = `user_race_test_${randomUUID()}`;
    const attackerClerkUserId = `user_race_test_${randomUUID()}`;

    await findOrCreateUserForIdentity({
      clerkUserId: originalClerkUserId,
      email,
      emailVerified: true,
      name: "Original",
      avatarUrl: null,
    });

    await expect(
      findOrCreateUserForIdentity({
        clerkUserId: attackerClerkUserId,
        email,
        emailVerified: false,
        name: "Unverified Claimant",
        avatarUrl: null,
      }),
    ).rejects.toThrow(/already associated with another account/);

    const rows = await prisma.user.findMany({ where: { email } });
    expect(rows).toHaveLength(1);
    expect(rows[0].authProviderId).toBe(originalClerkUserId);
  });
});
