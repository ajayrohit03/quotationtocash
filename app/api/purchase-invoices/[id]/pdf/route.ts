import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { purchaseInvoiceScopeWhere } from "@/lib/purchase-invoices/visibility";
import { renderPurchaseInvoicePdf } from "@/lib/pdf/purchase-invoice-render";
import type { PurchaseInvoicePdfData } from "@/lib/pdf/purchase-invoice-pdf";
import type { VendorSnapshot } from "@/lib/purchase-invoices/snapshots";
import type { BusinessSnapshot } from "@/lib/documents/snapshots";

// Downloading a PDF never changes status — available in any status, not
// just "received" — same rule as GET/POST /api/documents/:id/pdf.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business } = await requireBusiness();
    await requirePermission("purchase_invoices.view");
    const { id } = await params;

    const purchaseInvoice = await prisma.purchaseInvoice.findFirst({
      where: { id, businessId: business.id, ...(await purchaseInvoiceScopeWhere("view")) },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
    if (!purchaseInvoice) {
      return NextResponse.json({ error: "Purchase invoice not found" }, { status: 404 });
    }

    const data: PurchaseInvoicePdfData = {
      vendorInvoiceNumber: purchaseInvoice.vendorInvoiceNumber,
      vendorInvoiceDate: purchaseInvoice.vendorInvoiceDate,
      dueDate: purchaseInvoice.dueDate,
      currency: purchaseInvoice.currency,
      exchangeRate: purchaseInvoice.exchangeRate ? Number(purchaseInvoice.exchangeRate) : null,
      roundTotal: purchaseInvoice.roundTotal,
      taxableAmount: Number(purchaseInvoice.taxableAmount),
      cgst: Number(purchaseInvoice.cgst),
      sgst: Number(purchaseInvoice.sgst),
      igst: Number(purchaseInvoice.igst),
      cess: Number(purchaseInvoice.cess),
      total: Number(purchaseInvoice.total),
      shipmentMode: purchaseInvoice.shipmentMode,
      vesselVoyage: purchaseInvoice.vesselVoyage,
      sailedDate: purchaseInvoice.sailedDate,
      portOfLoading: purchaseInvoice.portOfLoading,
      portOfDischarge: purchaseInvoice.portOfDischarge,
      originPort: purchaseInvoice.originPort,
      placeOfDelivery: purchaseInvoice.placeOfDelivery,
      shipper: purchaseInvoice.shipper,
      ciReference: purchaseInvoice.ciReference,
      salesPerson: purchaseInvoice.salesPerson,
      containerNo: purchaseInvoice.containerNo,
      jobRef: purchaseInvoice.jobRef,
      customerRef: purchaseInvoice.customerRef,
      packageType: purchaseInvoice.packageType,
      noOfPackages: purchaseInvoice.noOfPackages ? Number(purchaseInvoice.noOfPackages) : null,
      hbl: purchaseInvoice.hbl,
      mbl: purchaseInvoice.mbl,
      weightKg: purchaseInvoice.weightKg ? Number(purchaseInvoice.weightKg) : null,
      chargeableWeight: purchaseInvoice.chargeableWeight
        ? Number(purchaseInvoice.chargeableWeight)
        : null,
      volumeCbm: purchaseInvoice.volumeCbm ? Number(purchaseInvoice.volumeCbm) : null,
      customsDocRef: purchaseInvoice.customsDocRef,
      termsOfShipment: purchaseInvoice.termsOfShipment,
      vendor: purchaseInvoice.vendorSnapshot as unknown as VendorSnapshot,
      business: purchaseInvoice.businessSnapshot as unknown as BusinessSnapshot,
      lineItems: purchaseInvoice.lineItems.map((item) => ({
        description: item.description,
        sac: item.sac,
        qty: Number(item.qty),
        unit: item.unit,
        rate: Number(item.rate),
        amount: Number(item.amount),
        amountInr: item.amountInr ? Number(item.amountInr) : null,
        taxableAmount: Number(item.taxableAmount),
        gstRate: item.gstRate ? Number(item.gstRate) : null,
        cgst: Number(item.cgst),
        sgst: Number(item.sgst),
        igst: Number(item.igst),
        cess: Number(item.cess),
        rateFC: item.rateFC ? Number(item.rateFC) : null,
        exRate: item.exRate ? Number(item.exRate) : null,
        fcCurrency: item.fcCurrency,
        amountFC: item.amountFC ? Number(item.amountFC) : null,
      })),
    };

    const pdfBuffer = await renderPurchaseInvoicePdf(data);
    const safeFilename = (purchaseInvoice.vendorInvoiceNumber || purchaseInvoice.id).replace(
      /[^a-zA-Z0-9-]/g,
      "_",
    );

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}.pdf"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
