import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { listInvitationsForBusiness } from "@/lib/invitations/service";
import { SettingsTabs } from "./settings-tabs";
import { toSettingsBusiness, type SettingsMember, type SettingsInvitation } from "./types";

export default async function SettingsPage() {
  const { business, membership, user } = await requireBusinessForPage();
  const isOwner = membership.role === "owner";
  // Everything except Tax/Billing is Admin-delegable (see
  // docs/invitation-onboarding-design.md §1.2) — Team management
  // included, which is the whole reason Admin exists.
  const isAdmin = isOwner || membership.role === "admin";

  // Only fetched for an owner/admin — matches the underlying APIs, which
  // 403 for anyone else. Independent of each other, so run concurrently
  // rather than one after the other.
  const [rawMembers, rawInvitations] = await Promise.all([
    isAdmin
      ? prisma.businessMember.findMany({
          where: { businessId: business.id },
          select: {
            id: true,
            role: true,
            title: true,
            reportsToId: true,
            isActive: true,
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve(null),
    isAdmin ? listInvitationsForBusiness(business.id) : Promise.resolve(null),
  ]);

  const members: SettingsMember[] | null = rawMembers;

  const invitations: SettingsInvitation[] | null =
    rawInvitations?.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      title: invitation.title,
      status: invitation.status,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
    })) ?? null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything from setup lives here, editable any time.
        </p>
      </div>
      <SettingsTabs
        business={toSettingsBusiness(business)}
        isOwner={isOwner}
        isAdmin={isAdmin}
        user={{ name: user.name, email: user.email }}
        members={members}
        invitations={invitations}
      />
    </div>
  );
}
