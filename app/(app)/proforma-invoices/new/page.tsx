import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { NewDocumentPicker } from "@/components/documents/new-document-picker";

export default async function NewProformaPage({
  searchParams,
}: PageProps<"/proforma-invoices/new">) {
  const { business } = await requireBusinessForPage();
  const { customerId } = await searchParams;

  const customers = await prisma.customer.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <NewDocumentPicker
      type="proforma"
      customers={customers}
      initialCustomerId={
        typeof customerId === "string" ? customerId : undefined
      }
    />
  );
}
