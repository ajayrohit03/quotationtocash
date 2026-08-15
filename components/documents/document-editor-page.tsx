import { notFound } from "next/navigation";
import type { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import {
  DocumentBuilder,
  type BuilderBusiness,
  type BuilderDocument,
} from "./document-builder";
import type { BuilderProduct } from "./types";

export async function DocumentEditorPage({
  type,
  id,
}: {
  type: DocumentType;
  id: string;
}) {
  const { business } = await requireBusinessForPage();

  const document = await prisma.document.findFirst({
    where: { id, businessId: business.id, type },
    include: {
      customer: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!document) {
    notFound();
  }

  const [customers, products] = await Promise.all([
    prisma.customer.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Decimal instances don't survive the Server -> Client boundary intact
  // (see components/documents/types.ts) — convert every Decimal field to
  // a plain number before handing this off to the client builder.
  const builderDocument: BuilderDocument = {
    id: document.id,
    type: document.type,
    number: document.number,
    status: document.status,
    customer: document.customer,
    issueDate: document.issueDate,
    dueDate: document.dueDate,
    validUntil: document.validUntil,
    paymentTerms: document.paymentTerms,
    validityTerms: document.validityTerms,
    notes: document.notes,
    termsText: document.termsText,
    lineItems: document.lineItems.map((item) => ({
      productId: item.productId,
      name: item.name,
      description: item.description ?? "",
      qty: Number(item.qty),
      rate: Number(item.rate),
      discountPct: Number(item.discountPct),
      gstRate: item.gstRate == null ? null : Number(item.gstRate),
    })),
  };

  const builderBusiness: BuilderBusiness = {
    gstEnabled: business.gstEnabled,
    gstDefaultRate:
      business.gstDefaultRate == null ? null : Number(business.gstDefaultRate),
    placeOfSupply: business.placeOfSupply,
  };

  const builderProducts: BuilderProduct[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    sku: product.sku,
    unit: product.unit,
    price: Number(product.price),
    gstRate: product.gstRate == null ? null : Number(product.gstRate),
  }));

  return (
    <DocumentBuilder
      document={builderDocument}
      business={builderBusiness}
      customers={customers}
      products={builderProducts}
    />
  );
}
