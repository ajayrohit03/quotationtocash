import { DocumentEditorPage } from "@/components/documents/document-editor-page";

export default async function QuotationEditorPage({
  params,
}: PageProps<"/quotations/[id]">) {
  const { id } = await params;
  return <DocumentEditorPage type="quotation" id={id} />;
}
