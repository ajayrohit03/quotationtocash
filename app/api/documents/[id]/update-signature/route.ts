import { NextResponse, type NextRequest } from "next/server";
import type { Document, DocumentType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness, type BusinessContext } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { documentSignatureUpdateSchema } from "@/lib/validation/document";
import { requireNonDraftForSignatureUpdate } from "@/lib/documents/status";
import { documentScopeWhere } from "@/lib/documents/visibility";
import type { BusinessSnapshot } from "@/lib/documents/snapshots";
import { uploadBusinessSignature } from "@/lib/storage/signature";

// Proforma reuses the invoices.* permission tier — see
// app/api/documents/route.ts's own copy of this comment.
const EDIT_PERMISSION: Record<DocumentType, Permission> = {
  quotation: "quotations.edit",
  invoice: "invoices.edit",
  proforma: "invoices.edit",
};

// The one narrow, explicit exception to "documents/:id/snapshots are
// frozen at save time, never touched again" (see schema.prisma's
// businessSnapshot comment and every other route in this directory).
// A signature collected after a document was sent — or discovered wrong
// only once finalized — is common enough in practice that re-issuing
// the whole document isn't a reasonable answer, but nothing else here
// gets the same treatment: name, address, GSTIN, bank details, customer
// details, and line items all stay exactly as frozen. Both handlers
// below surgically overwrite only the signature keys inside the
// existing businessSnapshot JSON blob — everything else in that blob
// (and the rest of the document) is read, spread, and rewritten
// byte-for-byte unchanged. Deliberately never touches the live
// Business.signature* columns — this document's copy diverges from the
// business's own profile from this point on, same as every other
// frozen snapshot field already does.
async function loadEditableDocument(
  context: BusinessContext,
  documentId: string,
): Promise<Document> {
  const { business } = context;
  const document = await prisma.document.findFirst({
    where: { id: documentId, businessId: business.id, ...(await documentScopeWhere("mutate")) },
  });
  if (!document || !(await hasPermission(context, EDIT_PERMISSION[document.type]))) {
    throw new NotFoundError();
  }
  requireNonDraftForSignatureUpdate(document.status);
  return document;
}

class NotFoundError extends Error {}

function patchSnapshot(
  current: BusinessSnapshot,
  patch: Partial<
    Pick<
      BusinessSnapshot,
      "signatureImageUrl" | "signatureSignatoryName" | "signatureDesignation"
    >
  >,
): BusinessSnapshot {
  return {
    ...current,
    ...(patch.signatureImageUrl !== undefined
      ? { signatureImageUrl: patch.signatureImageUrl }
      : {}),
    ...(patch.signatureSignatoryName !== undefined
      ? { signatureSignatoryName: patch.signatureSignatoryName }
      : {}),
    ...(patch.signatureDesignation !== undefined
      ? { signatureDesignation: patch.signatureDesignation }
      : {}),
  };
}

// Signatory name / designation, and (when already-hosted elsewhere) an
// explicit signatureImageUrl — the Settings-page-equivalent PATCH.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireBusiness();
    const { id } = await params;
    const document = await loadEditableDocument(context, id);

    const input = documentSignatureUpdateSchema.parse(await request.json());
    const currentSnapshot = document.businessSnapshot as unknown as BusinessSnapshot;

    const updated = await prisma.document.update({
      where: { id: document.id },
      data: { businessSnapshot: patchSnapshot(currentSnapshot, input) },
    });

    return NextResponse.json({ document: updated });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    return errorResponse(error);
  }
}

// Uploads a new signature image for this document only — same storage
// helper Settings' own signature upload uses (lib/storage/signature.ts),
// but that helper only ever touches Storage, never the Business row, so
// this never risks changing the business's own profile signature.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireBusiness();
    const { id } = await params;
    const document = await loadEditableDocument(context, id);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const signatureImageUrl = await uploadBusinessSignature(context.business.id, file);
    const currentSnapshot = document.businessSnapshot as unknown as BusinessSnapshot;

    const updated = await prisma.document.update({
      where: { id: document.id },
      data: {
        businessSnapshot: patchSnapshot(currentSnapshot, { signatureImageUrl }),
      },
    });

    return NextResponse.json({ document: updated });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    return errorResponse(error);
  }
}
