import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/respond";
import { requireBusinessAdmin } from "@/lib/auth/session";
import { invitationCreateSchema } from "@/lib/validation/invitation";
import { createOrResendInvitation, listInvitationsForBusiness } from "@/lib/invitations/service";
import { invitationAcceptUrl } from "@/lib/invitations/public-url";

export async function GET() {
  try {
    const { business } = await requireBusinessAdmin();
    const invitations = await listInvitationsForBusiness(business.id);
    return NextResponse.json({ invitations });
  } catch (error) {
    return errorResponse(error);
  }
}

// Always creates (or resends) the invitation and its token regardless of
// whether RESEND_API_KEY is configured — the response's `acceptUrl` is
// the copyable manual-share fallback the Team tab always shows, email
// sending is a best-effort side effect on top of it. See
// docs/invitation-onboarding-design.md §4.2.
export async function POST(request: NextRequest) {
  try {
    const { business, user } = await requireBusinessAdmin();
    const input = invitationCreateSchema.parse(await request.json());

    const { invitation, rawToken, resent, emailSent } =
      await createOrResendInvitation(business, user, input);

    return NextResponse.json(
      {
        invitation,
        acceptUrl: invitationAcceptUrl(rawToken),
        resent,
        emailSent,
      },
      { status: resent ? 200 : 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
