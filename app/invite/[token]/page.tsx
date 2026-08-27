import { AuthError } from "@/lib/auth/errors";
import { requireAuth } from "@/lib/auth/session";
import { lookupInvitationByToken } from "@/lib/invitations/service";
import { InvitationResponse } from "./invitation-response";

// Public — deliberately no auth gate at the top level. Someone needs to
// see *what* they're being invited to before deciding whether to sign in
// at all (docs/invitation-onboarding-design.md §4.3, page-state 2).
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lookup = await lookupInvitationByToken(token);

  if (lookup.state === "invalid") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16 text-center">
        <h1 className="text-lg font-semibold">This invitation is no longer valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have already been used, revoked, or expired. Ask whoever
          invited you to send a new one.
        </p>
      </div>
    );
  }

  // Not requireAuthForPage() — that redirects to /sign-in unconditionally,
  // which would hide the invitation details from someone who hasn't
  // signed in yet. Not-signed-in is a real, distinct state this page
  // renders itself (state 2 of §4.3), not an error to bounce away from.
  let currentUserEmail: string | null = null;
  try {
    const { user } = await requireAuth();
    currentUserEmail = user.email;
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }

  return (
    <InvitationResponse
      token={token}
      businessName={lookup.businessName}
      inviterName={lookup.inviterName}
      role={lookup.invitation.role === "admin" ? "admin" : "staff"}
      invitedEmail={lookup.invitation.email}
      currentUserEmail={currentUserEmail}
    />
  );
}
