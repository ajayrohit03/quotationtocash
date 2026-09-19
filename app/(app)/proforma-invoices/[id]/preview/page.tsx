import { DocumentPreviewPage } from "@/components/documents/document-preview-page";

export default async function ProformaPreviewPage({
  params,
}: PageProps<"/proforma-invoices/[id]/preview">) {
  const { id } = await params;
  return <DocumentPreviewPage type="proforma" id={id} />;
}
