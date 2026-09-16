import { z } from "zod";

// See docs/custom-fields-and-multicurrency-design.md §1a/§3.
export const customFieldTypeSchema = z.enum(["text", "number", "date"]);
export const customFieldScopeSchema = z.enum(["document", "lineItem"]);

export const customFieldDefinitionCreateSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(100),
  type: customFieldTypeSchema,
  scope: customFieldScopeSchema,
  // Null = applies to both quotations and invoices.
  appliesTo: z.enum(["quotation", "invoice"]).nullable().optional(),
});

export type CustomFieldDefinitionCreateInput = z.infer<
  typeof customFieldDefinitionCreateSchema
>;

// `scope` is deliberately absent — fixed at creation, never editable
// after (§3): a definition already snapshotted onto historical documents
// as one scope must never silently become the other. `type` stays
// editable since a value snapshot already froze its type string at save
// time regardless of what the live definition says later, same
// reasoning as `label`.
export const customFieldDefinitionUpdateSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  type: customFieldTypeSchema.optional(),
  appliesTo: z.enum(["quotation", "invoice"]).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type CustomFieldDefinitionUpdateInput = z.infer<
  typeof customFieldDefinitionUpdateSchema
>;

export const customFieldDefinitionReorderSchema = z.object({
  direction: z.enum(["up", "down"]),
});

export type CustomFieldDefinitionReorderInput = z.infer<
  typeof customFieldDefinitionReorderSchema
>;
