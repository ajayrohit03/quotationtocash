import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { documentScopeWhere } from "@/lib/documents/visibility";

// ============================================================================
// TEST-ONLY — DELETE BEFORE THE REAL IRP INTEGRATION SHIPS.
//
// Stands in for the real POST-to-IRP call (auth, IRN generation) so the
// IRN/QR display in document-render.tsx and document-pdf.tsx can be
// exercised end-to-end without real e-invoice1.gst.gov.in credentials —
// see lib/einvoice/buildIrpPayload.ts's own comment. Sets fake
// irn/ackNo/ackDate/QR data on the document and nothing else. This
// route must not exist once the real IRP integration route replaces it.
// ============================================================================
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireBusiness();
    const { business } = context;
    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: { id, businessId: business.id, ...(await documentScopeWhere("mutate")) },
    });
    if (!document || !(await hasPermission(context, "invoices.edit"))) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (document.type !== "invoice") {
      return NextResponse.json(
        { error: "IRNs can only be generated for invoices." },
        { status: 400 },
      );
    }

    // 64 hex chars, matching the real IRN's shape (a SHA-256 hex
    // digest) — not a real signature, just plausible-looking test data.
    const fakeIrn = randomBytes(32).toString("hex");
    const now = new Date();

    const updated = await prisma.document.update({
      where: { id },
      data: {
        irn: fakeIrn,
        irnGeneratedAt: now,
        irnAckNo: String(Math.floor(100000000000 + Math.random() * 900000000000)),
        // IRP's own ack-date format is "DD/MM/YYYY HH:mm:ss" — stored
        // verbatim as a string (see schema.prisma's irnAckDate comment),
        // reproduced here rather than reusing formatDateIST so the mock
        // matches IRP's real shape, not this app's own date convention.
        irnAckDate: now.toLocaleString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
        // Real IRP QR payloads are a signed, delimited string of the
        // invoice's own key fields — this is just enough fake structure
        // to be a non-trivial QR (a bare fake IRN alone renders a
        // near-empty QR) while staying obviously fake.
        einvoiceQrCode: `MOCK|${fakeIrn}|${document.number}|${document.total.toString()}`,
        einvoiceStatus: "generated",
      },
    });

    return NextResponse.json({ document: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
