import { NextResponse, type NextRequest } from "next/server";
import { toPreviewDocument } from "@/lib/documents/present";
import { resolvePublicDocumentAccess } from "@/lib/documents/public-access";
import { renderDocumentPdf } from "@/lib/pdf/render";

// Public, unauthenticated — same token-as-access-control model as the
// page it sits alongside (see ../page.tsx). Does not touch status; only
// the page view (GET /public/documents/:token) marks "viewed". Subdomain
// mismatch handling is identical to the page — see
// docs/public-share-subdomains-design.md §4.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const access = await resolvePublicDocumentAccess(token, "/pdf");
  if (access.kind === "not-found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (access.kind === "redirect") {
    return NextResponse.redirect(access.url, 307);
  }

  const previewDocument = toPreviewDocument(access.document);
  const pdfBuffer = await renderDocumentPdf(
    previewDocument,
    previewDocument.business.gstEnabled,
  );
  const safeFilename = previewDocument.number.replace(/[^a-zA-Z0-9-]/g, "_");

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename}.pdf"`,
    },
  });
}
