import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/respond";
import { requireBusinessAdmin } from "@/lib/auth/session";
import { revokeInvitation } from "@/lib/invitations/service";

// Dedicated action-verb endpoint, matching the existing payments/send/
// share convention rather than a generic PATCH-with-status-body.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusinessAdmin();
    const { id } = await params;

    await revokeInvitation(business.id, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
