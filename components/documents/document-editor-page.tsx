import { notFound } from "next/navigation";
import type { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { documentScopeWhere } from "@/lib/documents/visibility";
import {
  DocumentBuilder,
  type BuilderBusiness,
  type BuilderDocument,
  type BuilderCustomFieldDefinition,
} from "./document-builder";
import type { BuilderProduct } from "./types";
import type { CustomFieldValueSnapshot } from "@/lib/documents/custom-fields";

export async function DocumentEditorPage({
  type,
  id,
}: {
  type: DocumentType;
  id: string;
}) {
  const { business } = await requireBusinessForPage();

  // "mutate" scope, not "view" — the builder is where edits happen
  // (autosave PATCHes from here). Using view-scope would let a Manager
  // open a subordinate's document into an editable builder whose
  // autosave then silently 403s in the background the moment they type
  // anything; mutate-scope here means they're routed to the read-only
  // preview instead, consistent with what they can actually do. See
  // docs/permission-layer-design.md §6.
  const document = await prisma.document.findFirst({
    where: { id, businessId: business.id, type, ...(await documentScopeWhere("mutate")) },
    include: {
      customer: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!document) {
    notFound();
  }

  const [customers, products, customFieldDefinitions, lineItemCustomFieldDefinitions] =
    await Promise.all([
      prisma.customer.findMany({
        where: { businessId: business.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.product.findMany({
        where: { businessId: business.id },
        orderBy: { createdAt: "desc" },
      }),
      // Document-scope, active, and either applies to both types (null) or
      // this document's own type specifically.
      prisma.customFieldDefinition.findMany({
        where: {
          businessId: business.id,
          scope: "document",
          isActive: true,
          OR: [{ appliesTo: null }, { appliesTo: type }],
        },
        orderBy: { sortOrder: "asc" },
      }),
      // Same filter, line-item scope — one extra column per active
      // definition in the builder's line-items table.
      prisma.customFieldDefinition.findMany({
        where: {
          businessId: business.id,
          scope: "lineItem",
          isActive: true,
          OR: [{ appliesTo: null }, { appliesTo: type }],
        },
        orderBy: { sortOrder: "asc" },
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
    referenceNumber: document.referenceNumber,
    currency: document.currency,
    showInrEquivalent: document.showInrEquivalent,
    inrExchangeRate:
      document.inrExchangeRate == null ? null : Number(document.inrExchangeRate),
    lutDeclarationText: document.lutDeclarationText,
    customFieldValues:
      document.customFieldValues as unknown as CustomFieldValueSnapshot[],
    lineItems: document.lineItems.map((item) => ({
      productId: item.productId,
      name: item.name,
      description: item.description ?? "",
      qty: Number(item.qty),
      rate: Number(item.rate),
      discountPct: Number(item.discountPct),
      gstRate: item.gstRate == null ? null : Number(item.gstRate),
      foreignCurrency: item.foreignCurrency,
      foreignRate: item.foreignRate == null ? null : Number(item.foreignRate),
      exchangeRate: item.exchangeRate == null ? null : Number(item.exchangeRate),
      customFieldValues:
        item.customFieldValues as unknown as CustomFieldValueSnapshot[],
    })),
    totals: {
      subtotal: Number(document.subtotal),
      discountTotal: Number(document.discountTotal),
      taxableAmount: Number(document.taxableAmount),
      cgst: Number(document.cgst),
      sgst: Number(document.sgst),
      igst: Number(document.igst),
      total: Number(document.total),
    },
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

  const builderCustomFieldDefinitions: BuilderCustomFieldDefinition[] =
    customFieldDefinitions.map((def) => ({
      id: def.id,
      label: def.label,
      type: def.type,
      sortOrder: def.sortOrder,
    }));

  const builderLineItemCustomFieldDefinitions: BuilderCustomFieldDefinition[] =
    lineItemCustomFieldDefinitions.map((def) => ({
      id: def.id,
      label: def.label,
      type: def.type,
      sortOrder: def.sortOrder,
    }));

  return (
    // Keyed on the document id for the same reason as DocumentPreview
    // (see document-preview-page.tsx): without it, a client-side
    // navigation straight from one document's builder to another's would
    // let React reuse this instance and carry over the *previous*
    // document's unsaved line items/customer/dates into the new one —
    // and here that's real content, not just appearance, so autosave
    // could silently overwrite the new document with stale data.
    <DocumentBuilder
      key={builderDocument.id}
      document={builderDocument}
      business={builderBusiness}
      customers={customers}
      products={builderProducts}
      customFieldDefinitions={builderCustomFieldDefinitions}
      lineItemCustomFieldDefinitions={builderLineItemCustomFieldDefinitions}
    />
  );
}
