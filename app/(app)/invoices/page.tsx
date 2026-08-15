import { DocumentListPage } from "@/components/documents/document-list-page";

export default function InvoicesPage({
  searchParams,
}: PageProps<"/invoices">) {
  return <DocumentListPage type="invoice" searchParams={searchParams} />;
}
