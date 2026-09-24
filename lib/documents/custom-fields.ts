import type { DocumentType, Prisma } from "@prisma/client";
import { formatDateIST } from "@/lib/dates";

// Deliberately zod-free — this module is imported by client components
// (document-render.tsx, document-builder.tsx) purely for
// formatCustomFieldValue()/the CustomFieldValueSnapshot type. The zod
// validation schema for this same shape lives in
// lib/validation/custom-fields.ts instead, so a client component that
// only needs the display helper never pulls zod's whole runtime into
// the browser bundle along with it.

// CustomFieldDefinition.appliesTo only ever stores "quotation", "invoice",
// or null (see lib/validation/custom-fields.ts's schema — "proforma" was
// deliberately never added as its own appliesTo value) — a Proforma is
// Invoice-shaped (same builder, same custom fields, see
// docs/custom-fields-and-multicurrency-design.md), so a definition scoped
// to "invoice" applies to proforma documents too, same as it already
// applies to invoices. Shared so the document-scope and line-item-scope
// queries in document-editor-page.tsx can't drift out of sync on this.
export function customFieldAppliesToWhere(
  type: DocumentType,
): Prisma.CustomFieldDefinitionWhereInput {
  const matchingTypes: DocumentType[] = type === "proforma" ? ["proforma", "invoice"] : [type];
  return { OR: [{ appliesTo: null }, { appliesTo: { in: matchingTypes } }] };
}

// Stored on Document.customFieldValues (Json) — see
// docs/custom-fields-and-multicurrency-design.md §1a. Snapshots both the
// value AND the definition's label/type/sortOrder as of save time, same
// freeze-at-input rule as customerSnapshot/businessSnapshot: a later
// rename or archive of the CustomFieldDefinition must never change what
// an already-saved document shows.
export type CustomFieldValueSnapshot = {
  definitionId: string; // for edit-in-place while still a draft
  label: string;
  type: "text" | "number" | "date";
  value: string | number | null;
  sortOrder: number;
};

// Shared by document-render.tsx and document-pdf.tsx (same reasoning as
// bankDetailsLine/paymentDetailsLines in lib/documents/payment-details.ts)
// so both renderers format a date-type field identically rather than one
// showing a raw ISO string. A date field's value is stored as a plain
// "YYYY-MM-DD" string (the builder's <input type="date"> value,
// verbatim) — formatDateIST parses that the same way every other
// date-only field in this app already does (see its own comment on the
// en-CA round trip), so this doesn't invent a second date convention.
export function formatCustomFieldValue(entry: CustomFieldValueSnapshot): string {
  if (entry.value === null || entry.value === "") return "—";
  if (entry.type === "date" && typeof entry.value === "string") {
    return formatDateIST(entry.value, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  return String(entry.value);
}
