import { DocumentListPage } from "@/components/documents/document-list-page";

export default function QuotationsPage({
  searchParams,
}: PageProps<"/quotations">) {
  return <DocumentListPage type="quotation" searchParams={searchParams} />;
}
