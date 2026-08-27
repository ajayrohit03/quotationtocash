import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireBusiness } from "@/lib/auth/session";
import { todayInIST } from "@/lib/dates";
import { requireConvertibleQuotation } from "@/lib/documents/status";
import { getNextDocumentNumber } from "@/lib/documents/numbering";
import {
  buildBusinessSnapshot,
  buildCustomerSnapshot,
} from "@/lib/documents/snapshots";
import { documentScopeWhere } from "@/lib/documents/visibility";
import { requirePermission } from "@/lib/auth/permissions";

// Creates a brand-new invoice from a quotation — never mutates the
// quotation into one (build-prompt rule: "Do not mutate quotations when
// converting them into invoices"). Customer/business snapshots are
// rebuilt fresh from the live rows (same as any new document), but line
// items and totals are copied verbatim from the quotation's own frozen
// values — the quote's tax shouldn't silently recompute against a
// product rate or business default that's since changed.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { business, user } = await requireBusiness();
    const { id } = await params;

    // "mutate" scope — converting flips the quotation's own status to
    // "converted", a write; a Manager converting a subordinate's
    // quotation requires reassigning it first. See
    // docs/permission-layer-design.md §5, §6.
    const quotation = await prisma.document.findFirst({
      where: { id, businessId: business.id, ...(await documentScopeWhere("mutate")) },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
    if (!quotation) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (quotation.type !== "quotation") {
      return NextResponse.json(
        { error: "Only quotations can be converted to an invoice." },
        { status: 400 },
      );
    }
    await requirePermission("quotations.edit");
    await requirePermission("invoices.create");
    requireConvertibleQuotation(quotation.status);

    const customer = await prisma.customer.findFirst({
      where: { id: quotation.customerId, businessId: business.id },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const invoiceNumber = await getNextDocumentNumber(business.id, "invoice");

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          businessId: business.id,
          type: "invoice",
          number: invoiceNumber,
          customerId: customer.id,
          issueDate: todayInIST(),
          // The converting user, not copied from the quotation's creator —
          // this is a genuinely new document, and attribution should
          // reflect who actually created this invoice record.
          createdByUserId: user.id,
          currency: quotation.currency,
          notes: quotation.notes,
          termsText: quotation.termsText,
          template: business.documentTemplate,
          accentColor: business.accentColor,
          showTax: business.gstEnabled,
          customerSnapshot: buildCustomerSnapshot(customer),
          businessSnapshot: buildBusinessSnapshot(business),
          convertedFromQuotationId: quotation.id,
          // Preserved verbatim from the quotation — see module comment.
          subtotal: quotation.subtotal,
          discountTotal: quotation.discountTotal,
          taxableAmount: quotation.taxableAmount,
          cgst: quotation.cgst,
          sgst: quotation.sgst,
          igst: quotation.igst,
          total: quotation.total,
          lineItems: {
            createMany: {
              data: quotation.lineItems.map((item) => ({
                productId: item.productId,
                name: item.name,
                description: item.description,
                qty: item.qty,
                rate: item.rate,
                discountPct: item.discountPct,
                gstRate: item.gstRate,
                amount: item.amount,
                sortOrder: item.sortOrder,
              })),
            },
          },
        },
      });

      await tx.document.update({
        where: { id: quotation.id },
        data: { status: "converted" },
      });

      return created;
    });

    return NextResponse.json({ document: invoice }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
