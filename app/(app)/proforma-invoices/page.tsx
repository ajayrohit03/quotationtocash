import { DocumentListPage } from "@/components/documents/document-list-page";

export default function ProformaInvoicesPage({
  searchParams,
}: PageProps<"/proforma-invoices">) {
  return <DocumentListPage type="proforma" searchParams={searchParams} />;
}
