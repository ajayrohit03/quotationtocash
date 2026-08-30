import { z } from "zod";

export const lineItemInputSchema = z.object({
  productId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1, "Item name is required").max(300),
  description: z.string().trim().max(1000).optional(),
  qty: z.number().positive("Quantity must be greater than 0"),
  rate: z.number().min(0, "Rate can't be negative"),
  discountPct: z.number().min(0).max(100).optional(),
  gstRate: z.number().min(0).max(100).nullable().optional(),
});

export type LineItemInput = z.infer<typeof lineItemInputSchema>;

// Creation is deliberately minimal: the builder (Phase 6) creates an empty
// draft the moment "New Invoice"/"New Quotation" is clicked — so there's a
// real id to autosave against — then PATCHes content in as the user fills
// the form in. Line items, dates, terms etc. all come later via PATCH.
export const documentCreateSchema = z.object({
  type: z.enum(["quotation", "invoice"]),
  customerId: z.string().min(1, "Select a customer"),
});

export type DocumentCreateInput = z.infer<typeof documentCreateSchema>;

// Shared with the PDF route (POST /api/documents/:id/pdf accepts an
// optional appearance override so a download taken mid-edit — before the
// customize sidebar's debounced autosave lands — still matches what's on
// screen, per spec: "changes apply live to the preview and the exported
// PDF"). That override is render-only, never persisted, but still needs
// the same validation so a malformed value can't reach react-pdf.
export const appearanceUpdateSchema = z.object({
  template: z.enum(["classic", "modern", "minimal"]).optional(),
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #4F46E5")
    .optional(),
  showLogo: z.boolean().optional(),
  showGstinRow: z.boolean().optional(),
  showTax: z.boolean().optional(),
  showPayment: z.boolean().optional(),
  showNotes: z.boolean().optional(),
  showTerms: z.boolean().optional(),
  showReferenceNumber: z.boolean().optional(),
});

export type AppearanceUpdateInput = z.infer<typeof appearanceUpdateSchema>;

export const documentUpdateSchema = appearanceUpdateSchema.extend({
  // Auto-suggested at creation, but the spec calls it editable — unique
  // constraint violations are caught and surfaced as a clear error in the
  // route handler rather than a raw P2002.
  number: z.string().trim().min(1, "Number can't be empty").max(50).optional(),
  customerId: z.string().min(1).optional(),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  paymentTerms: z.string().trim().max(500).nullable().optional(),
  validityTerms: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  termsText: z.string().trim().max(2000).nullable().optional(),
  referenceNumber: z.string().trim().max(200).nullable().optional(),

  // Validated against isManuallySettableStatus() in the route handler,
  // not here — that check needs the document's type, which this schema
  // doesn't have visibility into.
  status: z.string().optional(),

  // When present, replaces the document's entire line item set.
  lineItems: z.array(lineItemInputSchema).optional(),
});

export type DocumentUpdateInput = z.infer<typeof documentUpdateSchema>;
