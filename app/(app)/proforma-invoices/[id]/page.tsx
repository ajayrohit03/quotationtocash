import { DocumentEditorPage } from "@/components/documents/document-editor-page";

export default async function ProformaEditorPage({
  params,
}: PageProps<"/proforma-invoices/[id]">) {
  const { id } = await params;
  return <DocumentEditorPage type="proforma" id={id} />;
}
