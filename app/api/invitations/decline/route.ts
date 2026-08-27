import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/respond";
import { requireAuth } from "@/lib/auth/session";
import { invitationActionSchema } from "@/lib/validation/invitation";
import { declineInvitation } from "@/lib/invitations/service";
import { InvitationError } from "@/lib/invitations/errors";
import { checkAcceptIpRateLimit } from "@/lib/invitations/rate-limits";
import { getClientIp } from "@/lib/request-ip";

export async function POST(request: NextRequest) {
  try {
    const limit = await checkAcceptIpRateLimit(getClientIp(request));
    if (!limit.allowed) {
      throw new InvitationError("Too many attempts — try again later.", 429);
    }

    const { user } = await requireAuth();
    const selector = invitationActionSchema.parse(await request.json());

    await declineInvitation(selector, user);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
