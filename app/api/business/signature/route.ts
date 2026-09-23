import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusinessAdmin } from "@/lib/auth/session";
import {
  deleteBusinessSignatureAtUrl,
  uploadBusinessSignature,
} from "@/lib/storage/signature";

// Admin-delegable, same tier as app/api/business/logo/route.ts — the
// Signature section lives in the Business profile tab alongside the logo
// (readOnly={!isAdmin} there), not a separate owner-only tab.
export async function POST(request: NextRequest) {
  try {
    const { business } = await requireBusinessAdmin();

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const signatureImageUrl = await uploadBusinessSignature(business.id, file);

    if (business.signatureImageUrl) {
      await deleteBusinessSignatureAtUrl(business.signatureImageUrl);
    }

    const updated = await prisma.business.update({
      where: { id: business.id },
      data: { signatureImageUrl },
    });

    return NextResponse.json({ business: updated });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const { business } = await requireBusinessAdmin();

    if (business.signatureImageUrl) {
      await deleteBusinessSignatureAtUrl(business.signatureImageUrl);
    }

    const updated = await prisma.business.update({
      where: { id: business.id },
      data: { signatureImageUrl: null },
    });

    return NextResponse.json({ business: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
