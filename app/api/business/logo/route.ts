import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusinessOwner } from "@/lib/auth/session";
import { deleteBusinessLogoAtUrl, uploadBusinessLogo } from "@/lib/storage/logo";

export async function POST(request: NextRequest) {
  try {
    const { business } = await requireBusinessOwner();

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
    const { business } = await requireBusinessOwner();

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
