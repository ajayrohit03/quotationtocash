import { DocumentPreviewPage } from "@/components/documents/document-preview-page";

export default async function InvoicePreviewPage({
  params,
}: PageProps<"/invoices/[id]/preview">) {
  const { id } = await params;
  return <DocumentPreviewPage type="invoice" id={id} />;
}
