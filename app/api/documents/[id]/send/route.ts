import { randomBytes } from "node:crypto";
import { Resend } from "resend";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { requireSendableDocument } from "@/lib/documents/status";
import { toPreviewDocument } from "@/lib/documents/present";
import { publicDocumentUrl } from "@/lib/documents/public-url";
import { buildDocumentEmailHtml } from "@/lib/email/document-email";
import { renderDocumentPdf } from "@/lib/pdf/render";
import { documentScopeWhere } from "@/lib/documents/visibility";
import { hasPermission, type Permission } from "@/lib/auth/permissions";

const EDIT_PERMISSION: Record<"quotation" | "invoice", Permission> = {
  quotation: "quotations.edit",
  invoice: "invoices.edit",
};

// The only code path allowed to set status = "sent" (spec rule) — emails
// the document via Resend, attaching the same PDF Download PDF produces.
// Re-sending an already-sent/viewed document is allowed (resend the
// email) but never regresses status back down.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireBusiness();
    const { business } = context;
    const { id } = await params;

    // "mutate" scope — sending writes sentAt/status and emails the
    // customer on the business's behalf; a Manager sending a
    // subordinate's draft requires reassigning it first. See
    // docs/permission-layer-design.md §5, §6.
    const document = await prisma.document.findFirst({
      where: { id, businessId: business.id, ...(await documentScopeWhere("mutate")) },
      include: { customer: true, lineItems: { orderBy: { sortOrder: "asc" } } },
    });
    if (!document || !(await hasPermission(context, EDIT_PERMISSION[document.type]))) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    requireSendableDocument(document.type, document.status);

    if (!document.customer.email) {
      return NextResponse.json(
        { error: "This customer has no email address on file." },
        { status: 400 },
      );
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Email sending isn't configured yet — add RESEND_API_KEY to the environment.",
        },
        { status: 400 },
      );
    }

    // Reuse an existing share token (don't invalidate a link that may
    // already be out there) — only mint one if this document has never
    // been shared or sent before.
    const shareToken = document.shareToken ?? randomBytes(24).toString("hex");

    const previewDocument = toPreviewDocument(document);
    const pdfBuffer = await renderDocumentPdf(previewDocument, business.gstEnabled);
    const viewUrl = publicDocumentUrl(shareToken, business.slug);

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "QuotationToCash <onboarding@resend.dev>",
      to: document.customer.email,
      subject: `${document.type === "quotation" ? "Quotation" : "Invoice"} ${document.number} from ${business.name}`,
      html: buildDocumentEmailHtml({
        businessName: business.name,
        customerName: document.customer.name,
        documentTypeLabel: document.type,
        documentNumber: document.number,
        total: Number(document.total),
        currency: document.currency,
        accentColor: document.accentColor,
        viewUrl,
      }),
      attachments: [
        {
          filename: `${document.number.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    if (sendError) {
      console.error(sendError);
      return NextResponse.json(
        { error: "Resend couldn't send the email. Try again." },
        { status: 502 },
      );
    }

    const updated = await prisma.document.update({
      where: { id },
      data: {
        shareToken,
        sentAt: new Date(),
        // Only the first send moves status out of draft — a resend of an
        // already-sent/viewed document shouldn't regress it.
        ...(document.status === "draft" ? { status: "sent" } : {}),
      },
    });

    return NextResponse.json({ document: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
