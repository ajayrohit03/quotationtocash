import type { CustomFieldValueSnapshot } from "@/lib/documents/custom-fields";

// Prisma's Decimal instances don't survive the Server -> Client Component
// boundary intact (only their internal digit/exponent/sign fields
// serialize; the prototype methods like .toString()/.greaterThan() are
// lost) — so every Decimal field a client component touches needs to
// cross that boundary as a plain number instead. This is Product's
// client-safe shape; pages must convert with Number(product.price) etc.
// before passing down.
export type BuilderProduct = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  unit: string | null;
  price: number;
  gstRate: number | null;
};

// A line item as edited in the builder, before it's ever sent to the
// server. `key` is a client-only React list key (not persisted — the
// server assigns real LineItem ids). gstRate is the item's own override
// only; the effective/inherited rate is resolved for display via
// resolveGstRate against the product + business default.
export type LocalLineItem = {
  key: string;
  productId: string | null;
  name: string;
  description: string;
  qty: number;
  rate: number;
  discountPct: number;
  gstRate: number | null;
  // Pure provenance for multi-currency pricing — see schema.prisma's
  // LineItem.foreignCurrency comment. `rate` above stays the one field
  // the tax engine reads; these three are never sent to it.
  foreignCurrency: string | null;
  foreignRate: number | null;
  exchangeRate: number | null;
  // Line-item-scope custom field values for this row — same shape as
  // Document.customFieldValues, see lib/documents/custom-fields.ts.
  customFieldValues: CustomFieldValueSnapshot[];
};

// Only what the builder needs to render an input and construct a fresh
// CustomFieldValueSnapshot on save — already filtered server-side to
// active and appliesTo this document's type (see
// document-editor-page.tsx). Shared by document-builder.tsx (document
// scope) and line-items-editor.tsx (line-item scope) — kept here rather
// than defined in document-builder.tsx to avoid a circular import
// between the two.
export type BuilderCustomFieldDefinition = {
  id: string;
  label: string;
  type: "text" | "number" | "date";
  sortOrder: number;
};
