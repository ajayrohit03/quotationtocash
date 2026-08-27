import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusinessAdmin } from "@/lib/auth/session";
import { deleteBusinessLogoAtUrl, uploadBusinessLogo } from "@/lib/storage/logo";

// Admin-delegable, matching the Business profile tab it's already
// grouped under (readOnly={!isAdmin} there) — this route was missed when
// that tab was widened during the invitation work, so the UI already
// showed these buttons as enabled for an Admin while the server still
// 403'd. See docs/permission-layer-design.md §1 Finding B.
export async function POST(request: NextRequest) {
  try {
    const { business } = await requireBusinessAdmin();

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const logoUrl = await uploadBusinessLogo(business.id, file);

    if (business.logoUrl) {
      await deleteBusinessLogoAtUrl(business.logoUrl);
    }

    const updated = await prisma.business.update({
      where: { id: business.id },
      data: { logoUrl },
    });

    return NextResponse.json({ business: updated });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const { business } = await requireBusinessAdmin();

    if (business.logoUrl) {
      await deleteBusinessLogoAtUrl(business.logoUrl);
    }

    const updated = await prisma.business.update({
      where: { id: business.id },
      data: { logoUrl: null },
    });

    return NextResponse.json({ business: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
