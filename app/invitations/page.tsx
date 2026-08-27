import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthForPage } from "@/lib/auth/page";
import { listPendingInvitationsForEmail } from "@/lib/invitations/service";
import { InvitationsList, type PendingInvitationSummary } from "./invitations-list";

// The "arrived without clicking the emailed link" entry point (see
// docs/invitation-onboarding-design.md §4.4) — signed up cold, or logged
// in, with an email that has pending invitations waiting for it. Only
// ever redirected to from /onboarding's own check, but also directly
// reachable, which is why it re-checks rather than trusting a referrer.
export default async function InvitationsPage() {
  const { user } = await requireAuthForPage();
  const invitations = await listPendingInvitationsForEmail(user.email);

  if (invitations.length === 0) {
    redirect("/onboarding");
  }

  const summaries: PendingInvitationSummary[] = invitations.map((invitation) => ({
    id: invitation.id,
    businessName: invitation.business.name,
    inviterName: invitation.invitedBy.name ?? invitation.invitedBy.email,
    role: invitation.role === "admin" ? "admin" : "staff",
  }));

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          You have pending invitations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Accept one to join that business, or skip to create your own.
        </p>
      </div>

      <InvitationsList invitations={summaries} />

      <Link
        href="/onboarding"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        Skip — create my own business instead
      </Link>
    </div>
  );
}
