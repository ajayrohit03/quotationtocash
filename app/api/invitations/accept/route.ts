import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/respond";
import { ACTIVE_BUSINESS_COOKIE, requireAuth } from "@/lib/auth/session";
import { invitationActionSchema } from "@/lib/validation/invitation";
import { acceptInvitation } from "@/lib/invitations/service";
import { InvitationError } from "@/lib/invitations/errors";
import { checkAcceptIpRateLimit } from "@/lib/invitations/rate-limits";
import { getClientIp } from "@/lib/request-ip";

// requireAuth(), not requireBusiness() — the accepting user has no
// membership in this business yet, so requireBusiness() would fail
// before this endpoint ever got a chance to create one. See
// docs/invitation-onboarding-design.md §4.3.
export async function POST(request: NextRequest) {
  try {
    const limit = await checkAcceptIpRateLimit(getClientIp(request));
    if (!limit.allowed) {
      throw new InvitationError("Too many attempts — try again later.", 429);
    }

    const { user } = await requireAuth();
    const selector = invitationActionSchema.parse(await request.json());

    const { businessId } = await acceptInvitation(selector, user);

    const response = NextResponse.json({ businessId });
    response.cookies.set(ACTIVE_BUSINESS_COOKIE, businessId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
