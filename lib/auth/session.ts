import "server-only";

import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import type { Business, BusinessMember, User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AuthError, ForbiddenError, NoBusinessError } from "@/lib/auth/errors";
import { findOrCreateUserForIdentity } from "@/lib/auth/user-identity";

export { findOrCreateUserForIdentity } from "@/lib/auth/user-identity";
export type { ClerkIdentity } from "@/lib/auth/user-identity";

export const ACTIVE_BUSINESS_COOKIE = "active_business_id";

// Mirrors the local User row to the signed-in Clerk identity. Called on
// every authenticated request; the common case (row already exists) is a
// single indexed lookup, and only the first request for a given Clerk user
// pays for the currentUser() call.
async function getOrCreateUser(clerkUserId: string): Promise<User> {
  const existing = await prisma.user.findUnique({
    where: { authProviderId: clerkUserId },
  });
  if (existing) return existing;

  const clerkUser = await currentUser();
  if (!clerkUser) {
    throw new AuthError("Clerk session has no matching user");
  }

  const primaryEmailAddress =
    clerkUser.emailAddresses.find(
      (address) => address.id === clerkUser.primaryEmailAddressId,
    ) ?? clerkUser.emailAddresses[0];

  if (!primaryEmailAddress) {
    throw new AuthError("Clerk user has no email address");
  }

  return findOrCreateUserForIdentity({
    clerkUserId,
    email: primaryEmailAddress.emailAddress,
    emailVerified: primaryEmailAddress.verification?.status === "verified",
    name:
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
      null,
    avatarUrl: clerkUser.imageUrl || null,
  });
}

async function requireAuthUncached(): Promise<{ user: User }> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    throw new AuthError();
  }
  const user = await getOrCreateUser(clerkUserId);
  return { user };
}

// Cached per request — see the comment on requireBusiness below.
export const requireAuth = cache(requireAuthUncached);

export type BusinessContext = {
  user: User;
  membership: BusinessMember;
  business: Business;
};

// Resolves the business the current request should act on. A user can
// belong to more than one business; the active one is remembered in a
// cookie and falls back to the oldest membership.
async function requireBusinessUncached(): Promise<BusinessContext> {
  const { user } = await requireAuth();

  const memberships = await prisma.businessMember.findMany({
    where: { userId: user.id },
    include: { business: true },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    throw new NoBusinessError();
  }

  const cookieStore = await cookies();
  const activeBusinessId = cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value;

  const membership =
    memberships.find((m) => m.businessId === activeBusinessId) ??
    memberships[0];

  return { user, membership, business: membership.business };
}

// Wrapped in React's cache() so that when a page, a layout, and any shared
// component in between each call requireAuth()/requireBusiness() during
// the same request, they share one DB round trip instead of racing their
// own. Scoped per request by Next.js — never shares results *across*
// requests, so it does nothing to dedupe e.g. a prefetch racing a real
// navigation (that's what findOrCreateUserForIdentity's catch block is for).
export const requireBusiness = cache(requireBusinessUncached);

export async function requireBusinessOwner(): Promise<BusinessContext> {
  const context = await requireBusiness();
  if (context.membership.role !== "owner") {
    throw new ForbiddenError("Only the business owner can do this");
  }
  return context;
}

// For verifying access to a specific businessId already in hand (e.g. one
// read off a record), as opposed to requireBusiness()'s "pick the active
// one" resolution.
export async function requireBusinessMembership(
  businessId: string,
): Promise<BusinessMember> {
  const { user } = await requireAuth();
  const membership = await prisma.businessMember.findUnique({
    where: { businessId_userId: { businessId, userId: user.id } },
  });
  if (!membership) {
    throw new ForbiddenError("Not a member of this business");
  }
  return membership;
}
