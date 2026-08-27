import "server-only";

import type { Business, Invitation, User } from "@prisma/client";
import { Resend } from "resend";
import { prisma } from "@/lib/db/prisma";
import { InvitationError } from "@/lib/invitations/errors";
import { generateInvitationToken, hashInvitationToken } from "@/lib/invitations/token";
import { invitationAcceptUrl } from "@/lib/invitations/public-url";
import { buildInvitationEmailHtml } from "@/lib/email/invitation-email";
import {
  checkInviterRateLimit,
  checkTargetEmailRateLimit,
} from "@/lib/invitations/rate-limits";
import type { InvitationCreateInput } from "@/lib/validation/invitation";

const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// Duck-typed, not `instanceof` — the same reason lib/api/respond.ts and
// lib/auth/user-identity.ts each keep their own local copy of this check:
// Turbopack can end up with two bundled copies of Prisma's error class in
// dev, which makes `instanceof` unreliable for an error that unquestionably
// has `code === "P2002"`.
function isUniqueConstraintViolation(error: unknown): error is { code: "P2002" } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

async function sendInvitationEmail(params: {
  to: string;
  businessName: string;
  inviterName: string;
  role: "admin" | "staff";
  acceptUrl: string;
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "QuotationToCash <onboarding@resend.dev>",
      to: params.to,
      subject: `${params.inviterName} invited you to join ${params.businessName} on QuotationToCash`,
      html: buildInvitationEmailHtml(params),
    });
    if (error) {
      console.error(error);
      return false;
    }
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

// Validates reportsToId, if provided, against this business's real,
// active members. Admin is a valid manager target alongside Staff (an
// Admin can be someone's real line manager even though the Admin's own
// document visibility never depends on tree position) — Owner never is.
// No cycle check is needed here: the invitee isn't a tree node yet, so a
// cycle is impossible until they accept. See
// docs/invitation-onboarding-design.md §4.1.
async function assertValidManager(
  businessId: string,
  reportsToId: string | null | undefined,
): Promise<void> {
  if (!reportsToId) return;

  const manager = await prisma.businessMember.findFirst({
    where: { id: reportsToId, businessId, role: { in: ["staff", "admin"] } },
  });
  if (!manager || !manager.isActive) {
    throw new InvitationError(
      "That manager isn't a valid, active staff or admin member of this business.",
      400,
    );
  }
}

export type CreateInvitationResult = {
  invitation: Invitation;
  rawToken: string;
  resent: boolean;
  emailSent: boolean;
};

// Creates a new invitation, or — if one's already pending for this exact
// business+email — rotates its token and resends instead of creating a
// second one. See docs/invitation-onboarding-design.md §4.1.
export async function createOrResendInvitation(
  business: Business,
  invitedBy: User,
  input: InvitationCreateInput,
): Promise<CreateInvitationResult> {
  const email = input.email.trim();

  const [inviterLimit, targetLimit] = await Promise.all([
    checkInviterRateLimit(invitedBy.id),
    checkTargetEmailRateLimit(email),
  ]);
  if (!inviterLimit.allowed) {
    throw new InvitationError(
      "You've sent a lot of invitations recently — try again in a bit.",
      429,
    );
  }
  if (!targetLimit.allowed) {
    throw new InvitationError(
      "This address has received several invitations recently — try again later.",
      429,
    );
  }

  await assertValidManager(business.id, input.reportsToId);

  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (existingUser) {
    const existingMembership = await prisma.businessMember.findUnique({
      where: {
        businessId_userId: { businessId: business.id, userId: existingUser.id },
      },
    });
    if (existingMembership?.isActive) {
      throw new InvitationError(
        "This person is already a member of this business.",
        409,
      );
    }
  }

  const { rawToken, tokenHash } = generateInvitationToken();
  const expiresAt = new Date(Date.now() + EXPIRY_MS);

  const pending = await prisma.invitation.findFirst({
    where: {
      businessId: business.id,
      email: { equals: email, mode: "insensitive" },
      status: "pending",
    },
  });

  let invitation: Invitation;
  let resent: boolean;

  if (pending) {
    invitation = await prisma.invitation.update({
      where: { id: pending.id },
      data: {
        role: input.role,
        title: input.title ?? null,
        reportsToId: input.reportsToId ?? null,
        tokenHash,
        expiresAt,
      },
    });
    resent = true;
  } else {
    try {
      invitation = await prisma.invitation.create({
        data: {
          businessId: business.id,
          email,
          role: input.role,
          title: input.title ?? null,
          reportsToId: input.reportsToId ?? null,
          tokenHash,
          expiresAt,
          invitedByUserId: invitedBy.id,
        },
      });
      resent = false;
    } catch (error) {
      // Lost a create/create race against the partial unique index (§2)
      // — the same "attempt insert, catch conflict, re-read and adopt"
      // pattern already proven for findOrCreateUserForIdentity. Whoever
      // won gets treated as the row to resend against.
      if (!isUniqueConstraintViolation(error)) throw error;

      const winner = await prisma.invitation.findFirst({
        where: {
          businessId: business.id,
          email: { equals: email, mode: "insensitive" },
          status: "pending",
        },
      });
      if (!winner) throw error;

      invitation = await prisma.invitation.update({
        where: { id: winner.id },
        data: {
          role: input.role,
          title: input.title ?? null,
          reportsToId: input.reportsToId ?? null,
          tokenHash,
          expiresAt,
        },
      });
      resent = true;
    }
  }

  const emailSent = await sendInvitationEmail({
    to: email,
    businessName: business.name,
    inviterName: invitedBy.name ?? invitedBy.email,
    role: input.role,
    acceptUrl: invitationAcceptUrl(rawToken),
  });

  return { invitation, rawToken, resent, emailSent };
}

export async function revokeInvitation(
  businessId: string,
  invitationId: string,
): Promise<void> {
  const result = await prisma.invitation.updateMany({
    where: { id: invitationId, businessId, status: "pending" },
    data: { status: "revoked" },
  });
  if (result.count === 0) {
    throw new InvitationError(
      "This invitation isn't pending, or doesn't exist.",
      404,
    );
  }
}

// Opportunistic housekeeping, not a background job: flips any stale
// pending-but-past-expiry rows to `expired` right before they're read, so
// the Team tab never shows a dead invite as "Pending" for days. See
// docs/invitation-onboarding-design.md §3.
export async function listInvitationsForBusiness(
  businessId: string,
): Promise<Invitation[]> {
  await prisma.invitation.updateMany({
    where: { businessId, status: "pending", expiresAt: { lte: new Date() } },
    data: { status: "expired" },
  });

  return prisma.invitation.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });
}

export type InvitationLookup =
  | { state: "invalid" }
  | {
      state: "valid";
      invitation: Invitation;
      businessName: string;
      inviterName: string;
    };

// Powers GET /invite/[token] — resolves a raw token to enough display
// data to render the right state, without requiring auth (see
// docs/invitation-onboarding-design.md §4.3). "invalid" covers
// doesn't-exist, expired, revoked, and already-accepted alike — never
// distinguished, so a party holding a dead token can't learn why (§3,
// §6.1).
export async function lookupInvitationByToken(
  rawToken: string,
): Promise<InvitationLookup> {
  const tokenHash = hashInvitationToken(rawToken);
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: { business: { select: { name: true } }, invitedBy: { select: { name: true, email: true } } },
  });

  if (
    !invitation ||
    invitation.status !== "pending" ||
    invitation.expiresAt <= new Date()
  ) {
    return { state: "invalid" };
  }

  return {
    state: "valid",
    invitation,
    businessName: invitation.business.name,
    inviterName: invitation.invitedBy.name ?? invitation.invitedBy.email,
  };
}

function assertEmailMatches(invitation: Invitation, currentUser: User): void {
  if (invitation.email.trim().toLowerCase() !== currentUser.email.trim().toLowerCase()) {
    throw new InvitationError(
      `This invitation was sent to ${invitation.email}, but you're signed in as ${currentUser.email}. Sign out and sign in as ${invitation.email} to accept, or ask the inviter to resend it to the right address.`,
      403,
    );
  }
}

// Two ways to point at an invitation:
//   - `token`: proof of possessing the emailed link — used by the public
//     /invite/[token] page, reachable whether or not the visitor is
//     signed in yet (§4.3).
//   - `id`: used only by the already-authenticated "arrived without the
//     link" interstitial (§4.4) — that page is only reachable via
//     requireAuthForPage(), and every id-based accept/decline still runs
//     assertEmailMatches() below, so the real security boundary (does
//     this invitation belong to the signed-in session's verified email)
//     is identical either way; id-based lookup never bypasses it.
type InvitationSelector = { token: string } | { id: string };

async function resolveInvitation(by: InvitationSelector): Promise<Invitation | null> {
  if ("token" in by) {
    return prisma.invitation.findUnique({ where: { tokenHash: hashInvitationToken(by.token) } });
  }
  return prisma.invitation.findUnique({ where: { id: by.id } });
}

export async function acceptInvitation(
  by: InvitationSelector,
  currentUser: User,
): Promise<{ businessId: string }> {
  const invitation = await resolveInvitation(by);

  if (
    !invitation ||
    invitation.status !== "pending" ||
    invitation.expiresAt <= new Date()
  ) {
    throw new InvitationError("This invitation is no longer valid.", 410);
  }

  assertEmailMatches(invitation, currentUser);

  return prisma.$transaction(async (tx) => {
    // Guarded update — same single-use race guard as the document
    // visibility feature's other concurrency-sensitive writes: whichever
    // request's UPDATE lands first in Postgres wins. See design doc §3.
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, status: "pending" },
      data: { status: "accepted", acceptedByUserId: currentUser.id },
    });
    if (claimed.count === 0) {
      throw new InvitationError("This invitation is no longer valid.", 410);
    }

    const existingMembership = await tx.businessMember.findUnique({
      where: {
        businessId_userId: {
          businessId: invitation.businessId,
          userId: currentUser.id,
        },
      },
    });

    if (!existingMembership) {
      await tx.businessMember.create({
        data: {
          businessId: invitation.businessId,
          userId: currentUser.id,
          role: invitation.role,
          title: invitation.title,
          reportsToId: invitation.reportsToId,
          isActive: true,
        },
      });
    } else if (existingMembership.isActive) {
      // Shouldn't be reachable — creation already blocks inviting an
      // active member — but don't silently overwrite an active
      // membership's role/title if it somehow is.
      throw new InvitationError(
        "You're already an active member of this business.",
        409,
      );
    } else {
      // Reactivating a former member (§4.1/§4.3) — a rehire may come
      // back at a different title/role/manager than they left with.
      await tx.businessMember.update({
        where: { id: existingMembership.id },
        data: {
          isActive: true,
          role: invitation.role,
          title: invitation.title,
          reportsToId: invitation.reportsToId,
        },
      });
    }

    return { businessId: invitation.businessId };
  });
}

export async function declineInvitation(
  by: InvitationSelector,
  currentUser: User,
): Promise<void> {
  const invitation = await resolveInvitation(by);

  if (
    !invitation ||
    invitation.status !== "pending" ||
    invitation.expiresAt <= new Date()
  ) {
    throw new InvitationError("This invitation is no longer valid.", 410);
  }

  assertEmailMatches(invitation, currentUser);

  await prisma.invitation.updateMany({
    where: { id: invitation.id, status: "pending" },
    data: { status: "revoked" },
  });
}

// Powers the "arrived without clicking the link" interstitial (§4.4) —
// signing up cold, or logging in, with an email that has pending
// invitations waiting for it.
export async function listPendingInvitationsForEmail(email: string) {
  return prisma.invitation.findMany({
    where: {
      email: { equals: email.trim(), mode: "insensitive" },
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    include: {
      business: { select: { name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
