// Deliberately NOT `import "server-only"` here (unlike session.ts) — this
// module only touches Prisma, no Clerk session/secrets, which is what lets
// lib/auth/__tests__/session.race.test.ts exercise it directly under
// Vitest's plain Node environment instead of Next's react-server condition.
// It's still server-side-only in practice (it hits the database directly),
// just not enforced by the bundler guard.

import type { User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AuthError } from "@/lib/auth/errors";

// Checked by code, not identity (`instanceof Prisma.PrismaClientKnownRequestError`).
// Prisma's driver-adapter runtime and the app's own module graph can end up
// with two different bundled copies of that class in dev (Turbopack rebuilds
// modules independently; this got exercised for real when .next/dev was
// deleted out from under a live dev server), which makes `instanceof` return
// false for an error that unquestionably has `code === "P2002"`. Duck-typing
// the code is what every Prisma error actually guarantees.
function isUniqueConstraintViolation(error: unknown): error is { code: "P2002" } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export type ClerkIdentity = {
  clerkUserId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
};

// The one and only place that creates a User row. Deliberately takes a
// pre-resolved identity instead of a Clerk user id, so it (a) has no
// dependency on a live Clerk session and can be exercised directly — see
// lib/auth/__tests__/session.race.test.ts, which hits this against a real
// database with two concurrent calls for the same identity — and (b) can't
// end up duplicated: every caller that needs a local User row for a Clerk
// identity goes through this function, full stop.
//
// Two distinct ways a naive "lookup by authProviderId, else insert" can
// throw a raw P2002 on User.email instead of doing the right thing:
//
// 1. A race: two requests for the same brand-new Clerk user run this
//    concurrently (e.g. a Link prefetch racing the real navigation, or two
//    tabs). Both miss the authProviderId lookup and both try to insert.
//    One wins; the other's insert collides. Handled below by re-reading
//    after the conflict and adopting whichever row actually landed.
// 2. Stale data: a User row already exists with this email under a
//    *different* authProviderId (e.g. the same person deleted and
//    recreated their Clerk account). Not a race — needs an explicit
//    policy, see the comment further down.
export async function findOrCreateUserForIdentity(
  identity: ClerkIdentity,
): Promise<User> {
  const { clerkUserId, email, emailVerified, name, avatarUrl } = identity;

  const existing = await prisma.user.findUnique({
    where: { authProviderId: clerkUserId },
  });
  if (existing) return existing;

  try {
    return await prisma.user.create({
      data: { authProviderId: clerkUserId, email, name, avatarUrl },
    });
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }

    // Lost the insert race — re-read rather than fail. If a concurrent
    // call already created this exact identity, adopt its row.
    const byAuthProviderId = await prisma.user.findUnique({
      where: { authProviderId: clerkUserId },
    });
    if (byAuthProviderId) return byAuthProviderId;

    // Not a race on authProviderId — the collision is a User row that
    // already owns this email under a different authProviderId. Policy:
    // only re-link it to this Clerk identity if Clerk has actually
    // verified the email (i.e. this session proved ownership of it) —
    // otherwise this would let anyone "claim" another account's row by
    // typing in their email, unverified. Clerk itself won't normally let
    // two accounts share a verified email, so in practice this path means
    // the same person recreated their Clerk account (new authProviderId,
    // same verified email) and should reattach to their existing row.
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      if (!emailVerified) {
        throw new AuthError(
          `${email} is already associated with another account and isn't verified on this session.`,
        );
      }
      return prisma.user.update({
        where: { id: byEmail.id },
        data: { authProviderId: clerkUserId, name, avatarUrl },
      });
    }

    throw error;
  }
}
