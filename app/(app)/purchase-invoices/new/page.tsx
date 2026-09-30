import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { PurchaseInvoiceBuilder } from "@/components/purchase-invoices/purchase-invoice-builder";

export default async function NewPurchaseInvoicePage() {
  const { business } = await requireBusinessForPage();

  const [vendors, jobs] = await Promise.all([
    prisma.vendor.findMany({
      where: { businessId: business.id, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.job.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold tracking-tight">New purchase invoice</h1>
      <PurchaseInvoiceBuilder
        mode="create"
        vendors={vendors}
        jobs={jobs}
        gstEnabled={business.gstEnabled}
      />
    </div>
  );
}
