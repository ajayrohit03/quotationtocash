import { DocumentPreviewPage } from "@/components/documents/document-preview-page";

export default async function QuotationPreviewPage({
  params,
}: PageProps<"/quotations/[id]/preview">) {
  const { id } = await params;
  return <DocumentPreviewPage type="quotation" id={id} />;
}
