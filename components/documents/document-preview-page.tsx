import { notFound } from "next/navigation";
import type { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { toPreviewDocument } from "@/lib/documents/present";
import { documentScopeWhere } from "@/lib/documents/visibility";
import { DocumentPreview } from "./document-preview";

export async function DocumentPreviewPage({
  type,
  id,
}: {
  type: DocumentType;
  id: string;
}) {
  const { business } = await requireBusinessForPage();

  const document = await prisma.document.findFirst({
    where: { id, businessId: business.id, type, ...(await documentScopeWhere("view")) },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      convertedToInvoice: { select: { id: true, number: true } },
      // Newest first — see docs/payment-tracking-design.md §6.
      payments: {
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        include: { recordedBy: true },
      },
    },
  });
  if (!document) {
    notFound();
  }

  // A viewer reaching this page via view-scope doesn't necessarily have
  // mutate-scope on the same document (e.g. a Manager looking at a
  // subordinate's document) — computed here, once, so the client
  // component never has to re-derive ownership itself. See
  // docs/permission-layer-design.md §5, §6.
  const mutableIds = await prisma.document.findFirst({
    where: { id, businessId: business.id, ...(await documentScopeWhere("mutate")) },
    select: { id: true },
  });
  const canEdit = mutableIds !== null;
  const canReassign = !canEdit && document.status === "draft";

  const previewDocument = toPreviewDocument(document);

  return (
    // Keyed on the document id: DocumentPreview holds appearance state in
    // useState, seeded once from `document` on mount. Without this key,
    // navigating client-side from one document's preview straight to
    // another's (same route pattern, `[id]` just changes) lets React
    // reuse the same component instance and carry over the *previous*
    // document's unsaved appearance state instead of resetting to the
    // new one's — a real risk for a field with legal/compliance weight.
    <DocumentPreview
      key={previewDocument.id}
      document={previewDocument}
      gstEnabled={business.gstEnabled}
      canEdit={canEdit}
      canReassign={canReassign}
    />
  );
}
