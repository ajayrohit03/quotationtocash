import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { appearanceUpdateSchema } from "@/lib/validation/document";
import { toPreviewDocument } from "@/lib/documents/present";
import { renderDocumentPdf } from "@/lib/pdf/render";
import { documentScopeWhere } from "@/lib/documents/visibility";

// Downloading a PDF never changes document status (spec rule — only the
// dedicated send/public-view endpoints do that), so this is available for
// a document in any status, not just drafts.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusiness();
    const { id } = await params;

    // "view" scope, not "mutate" — no write happens here at all;
    // downloading a subordinate's PDF doesn't require reassigning it
    // first. See docs/permission-layer-design.md §6.
    const document = await prisma.document.findFirst({
      where: { id, businessId: business.id, ...(await documentScopeWhere("view")) },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        payments: {
          orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
          include: { recordedBy: true },
        },
      },
    });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Optional body lets a download taken mid-edit reflect whatever the
    // customize sidebar currently shows, even before its debounced
    // autosave has landed — render-only, never persisted.
    const rawBody = await request.text();
    const appearanceOverride = rawBody
      ? appearanceUpdateSchema.parse(JSON.parse(rawBody))
      : {};

    const previewDocument = {
      ...toPreviewDocument(document),
      ...appearanceOverride,
    };

    const pdfBuffer = await renderDocumentPdf(previewDocument, business.gstEnabled);
    const safeFilename = previewDocument.number.replace(/[^a-zA-Z0-9-]/g, "_");

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}.pdf"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
