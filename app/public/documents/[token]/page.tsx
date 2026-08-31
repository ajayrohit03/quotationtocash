import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { shouldMarkViewed } from "@/lib/documents/status";
import { toPreviewDocument } from "@/lib/documents/present";
import { resolvePublicDocumentAccess } from "@/lib/documents/public-access";
import { DocumentRender } from "@/components/documents/document-render";

// Unauthenticated by design — no requireAuth()/requireBusiness() call
// here, matching the resource-based auth pattern the rest of the app
// uses (see proxy.ts): this route simply never checks for a session.
// Anyone holding the token can view; the token itself is the access
// control, completely unchanged by the subdomain feature below — see
// docs/public-share-subdomains-design.md §4.
export default async function PublicDocumentPage({
  params,
}: PageProps<"/public/documents/[token]">) {
  const { token } = await params;

  const access = await resolvePublicDocumentAccess(token, "");
  if (access.kind === "not-found") {
    notFound();
  }
  if (access.kind === "redirect") {
    redirect(access.url);
  }

  const { document } = access;

  // A document only ever moves forward through "viewed" — never
  // regressed back from something further along. Idempotent (viewedAt
  // only set if it wasn't already), so a redundant re-render or
  // link-prefetch hitting this twice is harmless.
  if (shouldMarkViewed(document.status)) {
    await prisma.document.update({
      where: { id: document.id },
      data: { status: "viewed", viewedAt: document.viewedAt ?? new Date() },
    });
  }

  const previewDocument = toPreviewDocument(document);
  const { business } = previewDocument;

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-10">
      <div className="mx-auto flex max-w-[794px] flex-col items-end gap-4">
        <a
          href={`/public/documents/${token}/pdf`}
          className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold text-white shadow-sm"
          style={{ background: previewDocument.accentColor }}
        >
          Download PDF
        </a>
        <DocumentRender
          type={previewDocument.type}
          number={previewDocument.number}
          issueDate={previewDocument.issueDate}
          dueDate={previewDocument.dueDate}
          validUntil={previewDocument.validUntil}
          paymentTerms={previewDocument.paymentTerms}
          validityTerms={previewDocument.validityTerms}
          notes={previewDocument.notes}
          termsText={previewDocument.termsText}
          referenceNumber={previewDocument.referenceNumber}
          payments={previewDocument.payments}
          amountPaid={previewDocument.amountPaid}
          remainingBalance={previewDocument.remainingBalance}
          creditBalance={previewDocument.creditBalance}
          currency={previewDocument.currency}
          business={previewDocument.business}
          customer={previewDocument.customer}
          lineItems={previewDocument.lineItems}
          totals={previewDocument.totals}
          gstEnabled={business.gstEnabled}
          appearance={{
            template: previewDocument.template,
            accentColor: previewDocument.accentColor,
            showLogo: previewDocument.showLogo,
            showGstinRow: previewDocument.showGstinRow,
            showTax: previewDocument.showTax,
            showPayment: previewDocument.showPayment,
            showNotes: previewDocument.showNotes,
            showTerms: previewDocument.showTerms,
            showReferenceNumber: previewDocument.showReferenceNumber,
          }}
        />
      </div>
    </div>
  );
}
