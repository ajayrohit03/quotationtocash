import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { hashInvitationToken } from "@/lib/invitations/token";
import { InvitationError } from "@/lib/invitations/errors";

// Real Business/User/BusinessMember/Invitation rows against Postgres — the
// service functions here take plain params (no Clerk session lookups), so
// unlike lib/documents/__tests__/visibility.test.ts this needs no
// auth-seam mocking, just the "server-only" import guard.
vi.mock("server-only", () => ({}));

const createdBusinessIds: string[] = [];
const createdUserIds: string[] = [];

afterEach(async () => {
  if (createdBusinessIds.length > 0) {
    await prisma.business.deleteMany({
      where: { id: { in: createdBusinessIds } },
    });
    createdBusinessIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

async function createUser(email?: string) {
  const user = await prisma.user.create({
    data: {
      email: email ?? `invite-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_invite_test_${randomUUID()}`,
      name: "Invite Test User",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function setupBusiness() {
  const business = await prisma.business.create({
    data: {
      name: `Invite Test Co ${randomUUID()}`,
      slug: `invite-test-${randomUUID()}`,
      email: `invite-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const owner = await createUser();
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, role: "owner" },
  });

  return { business, owner };
}

describe("createOrResendInvitation", () => {
  it("creates a pending invitation whose tokenHash matches the returned raw token", async () => {
    const { createOrResendInvitation } = await import("@/lib/invitations/service");
    const { business, owner } = await setupBusiness();
    const email = `invitee-${randomUUID()}@example.invalid`;

    const result = await createOrResendInvitation(business, owner, {
      email,
      role: "staff",
      title: "Sales Executive",
      reportsToId: null,
    });

    expect(result.resent).toBe(false);
    expect(result.invitation.status).toBe("pending");
    expect(result.invitation.tokenHash).toBe(hashInvitationToken(result.rawToken));
    expect(result.invitation.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("resends (rotates the token) instead of creating a second row for the same pending email", async () => {
    const { createOrResendInvitation } = await import("@/lib/invitations/service");
    const { business, owner } = await setupBusiness();
    const email = `invitee-${randomUUID()}@example.invalid`;

    const first = await createOrResendInvitation(business, owner, {
      email,
      role: "staff",
      title: null,
      reportsToId: null,
    });
    const second = await createOrResendInvitation(business, owner, {
      email,
      role: "admin",
      title: "Manager",
      reportsToId: null,
    });

    expect(second.resent).toBe(true);
    expect(second.invitation.id).toBe(first.invitation.id);
    expect(second.invitation.role).toBe("admin");
    expect(second.invitation.tokenHash).not.toBe(first.invitation.tokenHash);

    const count = await prisma.invitation.count({
      where: { businessId: business.id, email },
    });
    expect(count).toBe(1);

    // The old link is dead — rotating the token means it no longer
    // resolves to anything.
    const { lookupInvitationByToken } = await import("@/lib/invitations/service");
    const oldLookup = await lookupInvitationByToken(first.rawToken);
    expect(oldLookup.state).toBe("invalid");
  });

  it("rejects an invalid reportsToId", async () => {
    const { createOrResendInvitation } = await import("@/lib/invitations/service");
    const { business, owner } = await setupBusiness();

    await expect(
      createOrResendInvitation(business, owner, {
        email: `invitee-${randomUUID()}@example.invalid`,
        role: "staff",
        title: null,
        reportsToId: randomUUID(),
      }),
    ).rejects.toThrow(InvitationError);
  });

  it("rejects inviting someone who's already an active member", async () => {
    const { createOrResendInvitation } = await import("@/lib/invitations/service");
    const { business, owner } = await setupBusiness();
    const existingMember = await createUser();
    await prisma.businessMember.create({
      data: { businessId: business.id, userId: existingMember.id, role: "staff" },
    });

    await expect(
      createOrResendInvitation(business, owner, {
        email: existingMember.email,
        role: "staff",
        title: null,
        reportsToId: null,
      }),
    ).rejects.toThrow(InvitationError);
  });

  it("allows re-inviting a deactivated former member", async () => {
    const { createOrResendInvitation } = await import("@/lib/invitations/service");
    const { business, owner } = await setupBusiness();
    const former = await createUser();
    await prisma.businessMember.create({
      data: {
        businessId: business.id,
        userId: former.id,
        role: "staff",
        isActive: false,
      },
    });

    const result = await createOrResendInvitation(business, owner, {
      email: former.email,
      role: "staff",
      title: null,
      reportsToId: null,
    });
    expect(result.invitation.status).toBe("pending");
  });
});

describe("acceptInvitation", () => {
  it("creates a real BusinessMember with the invitation's role/title/reportsToId on a matching-email accept", async () => {
    const { createOrResendInvitation, acceptInvitation } = await import(
      "@/lib/invitations/service"
    );
    const { business, owner } = await setupBusiness();
    const manager = await createUser();
    const managerMember = await prisma.businessMember.create({
      data: { businessId: business.id, userId: manager.id, role: "staff" },
    });

    const invitee = await createUser();
    const { rawToken } = await createOrResendInvitation(business, owner, {
      email: invitee.email,
      role: "staff",
      title: "Sales Executive",
      reportsToId: managerMember.id,
    });

    const { businessId } = await acceptInvitation({ token: rawToken }, invitee);
    expect(businessId).toBe(business.id);

    const membership = await prisma.businessMember.findUniqueOrThrow({
      where: { businessId_userId: { businessId: business.id, userId: invitee.id } },
    });
    expect(membership.role).toBe("staff");
    expect(membership.title).toBe("Sales Executive");
    expect(membership.reportsToId).toBe(managerMember.id);
    expect(membership.isActive).toBe(true);

    const invitation = await prisma.invitation.findFirstOrThrow({
      where: { businessId: business.id },
    });
    expect(invitation.status).toBe("accepted");
    expect(invitation.acceptedByUserId).toBe(invitee.id);
  });

  it("rejects accept from a signed-in account whose email doesn't match the invitation", async () => {
    const { createOrResendInvitation, acceptInvitation } = await import(
      "@/lib/invitations/service"
    );
    const { business, owner } = await setupBusiness();
    const invitee = await createUser();
    const wrongAccount = await createUser();

    const { rawToken } = await createOrResendInvitation(business, owner, {
      email: invitee.email,
      role: "staff",
      title: null,
      reportsToId: null,
    });

    await expect(acceptInvitation({ token: rawToken }, wrongAccount)).rejects.toThrow(
      InvitationError,
    );

    const membership = await prisma.businessMember.findUnique({
      where: {
        businessId_userId: { businessId: business.id, userId: wrongAccount.id },
      },
    });
    expect(membership).toBeNull();

    const invitation = await prisma.invitation.findFirstOrThrow({
      where: { businessId: business.id },
    });
    expect(invitation.status).toBe("pending");
  });

  it("rejects an already-accepted (single-use) token on a second attempt", async () => {
    const { createOrResendInvitation, acceptInvitation } = await import(
      "@/lib/invitations/service"
    );
    const { business, owner } = await setupBusiness();
    const invitee = await createUser();

    const { rawToken } = await createOrResendInvitation(business, owner, {
      email: invitee.email,
      role: "staff",
      title: null,
      reportsToId: null,
    });

    await acceptInvitation({ token: rawToken }, invitee);
    await expect(acceptInvitation({ token: rawToken }, invitee)).rejects.toThrow(
      InvitationError,
    );
  });

  it("rejects an expired invitation", async () => {
    const { acceptInvitation } = await import("@/lib/invitations/service");
    const { business, owner } = await setupBusiness();
    const invitee = await createUser();
    const rawToken = randomUUID();

    await prisma.invitation.create({
      data: {
        businessId: business.id,
        email: invitee.email,
        role: "staff",
        tokenHash: hashInvitationToken(rawToken),
        invitedByUserId: owner.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await expect(acceptInvitation({ token: rawToken }, invitee)).rejects.toThrow(
      InvitationError,
    );
  });

  it("rejects a revoked invitation", async () => {
    const { createOrResendInvitation, acceptInvitation, revokeInvitation } = await import(
      "@/lib/invitations/service"
    );
    const { business, owner } = await setupBusiness();
    const invitee = await createUser();

    const { invitation, rawToken } = await createOrResendInvitation(business, owner, {
      email: invitee.email,
      role: "staff",
      title: null,
      reportsToId: null,
    });
    await revokeInvitation(business.id, invitation.id);

    await expect(acceptInvitation({ token: rawToken }, invitee)).rejects.toThrow(
      InvitationError,
    );
  });

  it("reactivates a deactivated former member instead of creating a duplicate row", async () => {
    const { createOrResendInvitation, acceptInvitation } = await import(
      "@/lib/invitations/service"
    );
    const { business, owner } = await setupBusiness();
    const former = await createUser();
    await prisma.businessMember.create({
      data: {
        businessId: business.id,
        userId: former.id,
        role: "staff",
        title: "Old Title",
        isActive: false,
      },
    });

    const { rawToken } = await createOrResendInvitation(business, owner, {
      email: former.email,
      role: "admin",
      title: "New Title",
      reportsToId: null,
    });

    await acceptInvitation({ token: rawToken }, former);

    const memberships = await prisma.businessMember.findMany({
      where: { businessId: business.id, userId: former.id },
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].isActive).toBe(true);
    expect(memberships[0].role).toBe("admin");
    expect(memberships[0].title).toBe("New Title");
  });

  it("also accepts by invitation id, for the authenticated 'arrived without the link' path — still enforcing the email match", async () => {
    const { createOrResendInvitation, acceptInvitation } = await import(
      "@/lib/invitations/service"
    );
    const { business, owner } = await setupBusiness();
    const invitee = await createUser();
    const wrongAccount = await createUser();

    const { invitation } = await createOrResendInvitation(business, owner, {
      email: invitee.email,
      role: "staff",
      title: null,
      reportsToId: null,
    });

    await expect(
      acceptInvitation({ id: invitation.id }, wrongAccount),
    ).rejects.toThrow(InvitationError);

    const { businessId } = await acceptInvitation({ id: invitation.id }, invitee);
    expect(businessId).toBe(business.id);
  });
});

describe("declineInvitation", () => {
  it("revokes a pending invitation on a matching-email decline", async () => {
    const { createOrResendInvitation, declineInvitation } = await import(
      "@/lib/invitations/service"
    );
    const { business, owner } = await setupBusiness();
    const invitee = await createUser();

    const { rawToken, invitation } = await createOrResendInvitation(business, owner, {
      email: invitee.email,
      role: "staff",
      title: null,
      reportsToId: null,
    });

    await declineInvitation({ token: rawToken }, invitee);

    const updated = await prisma.invitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    expect(updated.status).toBe("revoked");
  });

  it("rejects decline from a signed-in account whose email doesn't match", async () => {
    const { createOrResendInvitation, declineInvitation } = await import(
      "@/lib/invitations/service"
    );
    const { business, owner } = await setupBusiness();
    const invitee = await createUser();
    const wrongAccount = await createUser();

    const { rawToken, invitation } = await createOrResendInvitation(business, owner, {
      email: invitee.email,
      role: "staff",
      title: null,
      reportsToId: null,
    });

    await expect(declineInvitation({ token: rawToken }, wrongAccount)).rejects.toThrow(
      InvitationError,
    );

    const unchanged = await prisma.invitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    expect(unchanged.status).toBe("pending");
  });
});

describe("revokeInvitation", () => {
  it("404s (via InvitationError) revoking something that isn't pending", async () => {
    const { createOrResendInvitation, revokeInvitation } = await import(
      "@/lib/invitations/service"
    );
    const { business, owner } = await setupBusiness();
    const invitee = await createUser();

    const { invitation } = await createOrResendInvitation(business, owner, {
      email: invitee.email,
      role: "staff",
      title: null,
      reportsToId: null,
    });
    await revokeInvitation(business.id, invitation.id);

    await expect(revokeInvitation(business.id, invitation.id)).rejects.toThrow(
      InvitationError,
    );
  });
});

describe("lookupInvitationByToken", () => {
  it("resolves a valid token to business/inviter display data", async () => {
    const { createOrResendInvitation, lookupInvitationByToken } = await import(
      "@/lib/invitations/service"
    );
    const { business, owner } = await setupBusiness();
    const invitee = await createUser();

    const { rawToken } = await createOrResendInvitation(business, owner, {
      email: invitee.email,
      role: "staff",
      title: null,
      reportsToId: null,
    });

    const lookup = await lookupInvitationByToken(rawToken);
    expect(lookup.state).toBe("valid");
    if (lookup.state === "valid") {
      expect(lookup.businessName).toBe(business.name);
    }
  });

  it("returns 'invalid' for a token that never existed", async () => {
    const { lookupInvitationByToken } = await import("@/lib/invitations/service");
    const lookup = await lookupInvitationByToken(randomUUID());
    expect(lookup.state).toBe("invalid");
  });
});

describe("listPendingInvitationsForEmail", () => {
  it("finds a pending invitation by email case-insensitively", async () => {
    const { createOrResendInvitation, listPendingInvitationsForEmail } = await import(
      "@/lib/invitations/service"
    );
    const { business, owner } = await setupBusiness();
    const email = `Invitee-${randomUUID()}@Example.Invalid`;

    await createOrResendInvitation(business, owner, {
      email,
      role: "staff",
      title: null,
      reportsToId: null,
    });

    const found = await listPendingInvitationsForEmail(email.toLowerCase());
    expect(found).toHaveLength(1);
    expect(found[0].business.name).toBe(business.name);
  });

  it("does not return a revoked invitation", async () => {
    const { createOrResendInvitation, declineInvitation, listPendingInvitationsForEmail } =
      await import("@/lib/invitations/service");
    const { business, owner } = await setupBusiness();
    const invitee = await createUser();

    const { rawToken } = await createOrResendInvitation(business, owner, {
      email: invitee.email,
      role: "staff",
      title: null,
      reportsToId: null,
    });
    await declineInvitation({ token: rawToken }, invitee);

    const found = await listPendingInvitationsForEmail(invitee.email);
    expect(found).toHaveLength(0);
  });
});
