import { Suspense } from "react";
import Link from "next/link";
import { FileInput } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { formatCurrency } from "@/lib/format";
import { formatDateIST } from "@/lib/dates";
import { purchaseInvoiceScopeWhere } from "@/lib/purchase-invoices/visibility";
import { StatusBadge } from "@/components/documents/status-badge";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const HEAD_CLASS = "bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground";

export default function PurchaseInvoicesPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Purchase invoices</h1>
        <Button nativeButton={false} render={<Link href="/purchase-invoices/new" />}>
          Record purchase invoice
        </Button>
      </div>

      <Suspense fallback={<TableSkeleton />}>
        <PurchaseInvoicesContent />
      </Suspense>
    </div>
  );
}

async function PurchaseInvoicesContent() {
  const { business } = await requireBusinessForPage();

  const purchaseInvoices = await prisma.purchaseInvoice.findMany({
    where: { businessId: business.id, ...(await purchaseInvoiceScopeWhere("view")) },
    orderBy: { createdAt: "desc" },
    include: { vendor: { select: { id: true, name: true } } },
  });

  if (purchaseInvoices.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
        <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <FileInput className="size-5" />
        </span>
        <p className="text-sm font-medium">No purchase invoices yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Record a vendor invoice to start tracking what you owe.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={HEAD_CLASS}>Vendor</TableHead>
            <TableHead className={HEAD_CLASS}>Invoice no.</TableHead>
            <TableHead className={HEAD_CLASS}>Date</TableHead>
            <TableHead className={HEAD_CLASS}>Status</TableHead>
            <TableHead className={`${HEAD_CLASS} text-right`}>Total</TableHead>
            <TableHead className={`${HEAD_CLASS} text-right`}>Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchaseInvoices.map((pi) => {
            const balance = Math.max(0, Number(pi.total) - Number(pi.amountPaid));
            return (
              <TableRow key={pi.id} className="cursor-pointer">
                <TableCell className="p-0">
                  <Link
                    href={`/purchase-invoices/${pi.id}`}
                    className="block px-4 py-2.5 font-medium"
                  >
                    {pi.vendor.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {pi.vendorInvoiceNumber || "—"}
                </TableCell>
                <TableCell>{formatDateIST(pi.vendorInvoiceDate)}</TableCell>
                <TableCell>
                  <StatusBadge status={pi.status} />
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(pi.total, pi.currency)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(balance, pi.currency)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
