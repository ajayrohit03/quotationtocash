import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { hasPermission } from "@/lib/auth/permissions";
import { formatCurrency } from "@/lib/format";
import { formatDateIST } from "@/lib/dates";
import { purchaseInvoiceScopeWhere } from "@/lib/purchase-invoices/visibility";
import { StatusBadge } from "@/components/documents/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PurchaseInvoiceBuilder } from "@/components/purchase-invoices/purchase-invoice-builder";
import { PurchaseInvoiceActions } from "@/components/purchase-invoices/purchase-invoice-actions";
import { PurchaseInvoicePaymentActions } from "@/components/purchase-invoices/purchase-invoice-payment-actions";

const HEAD_CLASS = "bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground";

function d(value: number | null): string {
  return value == null ? "" : String(value);
}

export default async function PurchaseInvoiceDetailPage({
  params,
}: PageProps<"/purchase-invoices/[id]">) {
  const context = await requireBusinessForPage();
  const { business } = context;
  const { id } = await params;

  const purchaseInvoice = await prisma.purchaseInvoice.findFirst({
    where: { id, businessId: business.id, ...(await purchaseInvoiceScopeWhere("view")) },
    include: {
      vendor: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      payments: {
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        include: { recordedBy: true },
      },
    },
  });
  if (!purchaseInvoice) {
    notFound();
  }

  if (purchaseInvoice.status === "received") {
    const vendors = await prisma.vendor.findMany({
      where: { businessId: business.id, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    // A vendor that's since been deactivated but is still this invoice's
    // own vendor must still appear as a selectable option, or the form
    // can't even render its current value.
    if (!vendors.some((v) => v.id === purchaseInvoice.vendorId)) {
      vendors.push({ id: purchaseInvoice.vendor.id, name: purchaseInvoice.vendor.name });
    }

    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight">Edit purchase invoice</h1>
          <PurchaseInvoiceActions
            id={purchaseInvoice.id}
            status={purchaseInvoice.status}
            vendorInvoiceNumber={purchaseInvoice.vendorInvoiceNumber}
          />
        </div>
        <PurchaseInvoiceBuilder
          mode="edit"
          purchaseInvoiceId={purchaseInvoice.id}
          vendors={vendors}
          gstEnabled={business.gstEnabled}
          initialValues={{
            vendorId: purchaseInvoice.vendorId,
            vendorInvoiceNumber: purchaseInvoice.vendorInvoiceNumber,
            vendorInvoiceDate: purchaseInvoice.vendorInvoiceDate.toISOString().slice(0, 10),
            dueDate: purchaseInvoice.dueDate?.toISOString().slice(0, 10) ?? "",
            currency: purchaseInvoice.currency,
            exchangeRate: purchaseInvoice.exchangeRate ? String(purchaseInvoice.exchangeRate) : "",
            roundTotal: purchaseInvoice.roundTotal,
            shipmentMode: purchaseInvoice.shipmentMode ?? "",
            vesselVoyage: purchaseInvoice.vesselVoyage ?? "",
            sailedDate: purchaseInvoice.sailedDate?.toISOString().slice(0, 10) ?? "",
            portOfLoading: purchaseInvoice.portOfLoading ?? "",
            portOfDischarge: purchaseInvoice.portOfDischarge ?? "",
            originPort: purchaseInvoice.originPort ?? "",
            placeOfDelivery: purchaseInvoice.placeOfDelivery ?? "",
            shipper: purchaseInvoice.shipper ?? "",
            ciReference: purchaseInvoice.ciReference ?? "",
            salesPerson: purchaseInvoice.salesPerson ?? "",
            containerNo: purchaseInvoice.containerNo ?? "",
            jobRef: purchaseInvoice.jobRef ?? "",
            customerRef: purchaseInvoice.customerRef ?? "",
            packageType: purchaseInvoice.packageType ?? "",
            noOfPackages: d(purchaseInvoice.noOfPackages ? Number(purchaseInvoice.noOfPackages) : null),
            hbl: purchaseInvoice.hbl ?? "",
            mbl: purchaseInvoice.mbl ?? "",
            weightKg: d(purchaseInvoice.weightKg ? Number(purchaseInvoice.weightKg) : null),
            chargeableWeight: d(
              purchaseInvoice.chargeableWeight ? Number(purchaseInvoice.chargeableWeight) : null,
            ),
            volumeCbm: d(purchaseInvoice.volumeCbm ? Number(purchaseInvoice.volumeCbm) : null),
            customsDocRef: purchaseInvoice.customsDocRef ?? "",
            termsOfShipment: purchaseInvoice.termsOfShipment ?? "",
            notes: purchaseInvoice.notes ?? "",
            lineItems: purchaseInvoice.lineItems.length
              ? purchaseInvoice.lineItems.map((item) => ({
                  description: item.description,
                  sac: item.sac ?? "",
                  qty: Number(item.qty),
                  unit: item.unit ?? "",
                  rate: Number(item.rate),
                  gstRate: item.gstRate ? Number(item.gstRate) : null,
                }))
              : undefined,
          }}
        />
      </div>
    );
  }

  const balance = Math.max(0, Number(purchaseInvoice.total) - Number(purchaseInvoice.amountPaid));
  const canPay = await hasPermission(context, "purchase_invoices.pay");

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight">
              {purchaseInvoice.vendor.name}
            </h1>
            <StatusBadge status={purchaseInvoice.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {purchaseInvoice.vendorInvoiceNumber || "—"} ·{" "}
            {formatDateIST(purchaseInvoice.vendorInvoiceDate)}
          </p>
        </div>
        <PurchaseInvoiceActions
          id={purchaseInvoice.id}
          status={purchaseInvoice.status}
          vendorInvoiceNumber={purchaseInvoice.vendorInvoiceNumber}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-2xl">
            {formatCurrency(purchaseInvoice.total, purchaseInvoice.currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Paid</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-2xl">
            {formatCurrency(purchaseInvoice.amountPaid, purchaseInvoice.currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Balance</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-2xl">
            {formatCurrency(balance, purchaseInvoice.currency)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={HEAD_CLASS}>Description</TableHead>
                <TableHead className={HEAD_CLASS}>SAC</TableHead>
                <TableHead className={HEAD_CLASS}>Qty</TableHead>
                <TableHead className={`${HEAD_CLASS} text-right`}>Rate</TableHead>
                <TableHead className={`${HEAD_CLASS} text-right`}>Taxable</TableHead>
                <TableHead className={`${HEAD_CLASS} text-right`}>CGST</TableHead>
                <TableHead className={`${HEAD_CLASS} text-right`}>SGST</TableHead>
                <TableHead className={`${HEAD_CLASS} text-right`}>IGST</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseInvoice.lineItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell>{item.sac || "—"}</TableCell>
                  <TableCell>
                    {Number(item.qty)}
                    {item.unit ? ` ${item.unit}` : ""}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(item.rate, purchaseInvoice.currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(item.taxableAmount)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(item.cgst)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(item.sgst)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(item.igst)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Payments</CardTitle>
          <PurchaseInvoicePaymentActions
            id={purchaseInvoice.id}
            status={purchaseInvoice.status}
            currency={purchaseInvoice.currency}
            remainingBalance={balance}
            hasPayments={purchaseInvoice.payments.length > 0}
            lastPayment={
              purchaseInvoice.payments[0]
                ? {
                    amount: Number(purchaseInvoice.payments[0].amount),
                    paidAt: purchaseInvoice.payments[0].paidAt.toISOString(),
                  }
                : null
            }
            canPay={canPay}
          />
        </CardHeader>
        <CardContent className="p-0">
          {purchaseInvoice.payments.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No payments recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={HEAD_CLASS}>Date</TableHead>
                  <TableHead className={HEAD_CLASS}>Method</TableHead>
                  <TableHead className={HEAD_CLASS}>Note</TableHead>
                  <TableHead className={HEAD_CLASS}>Recorded by</TableHead>
                  <TableHead className={`${HEAD_CLASS} text-right`}>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseInvoice.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDateIST(payment.paidAt)}</TableCell>
                    <TableCell>{payment.method || "—"}</TableCell>
                    <TableCell>{payment.note || "—"}</TableCell>
                    <TableCell>
                      {payment.recordedBy?.name ?? payment.recordedBy?.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(payment.amount, purchaseInvoice.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {purchaseInvoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{purchaseInvoice.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}
