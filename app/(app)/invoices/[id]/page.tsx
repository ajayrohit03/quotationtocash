import { DocumentEditorPage } from "@/components/documents/document-editor-page";

export default async function InvoiceEditorPage({
  params,
}: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  return <DocumentEditorPage type="invoice" id={id} />;
}
