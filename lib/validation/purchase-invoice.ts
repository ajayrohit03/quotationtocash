import { z } from "zod";

export const purchaseLineItemInputSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(300),
  sac: z.string().trim().max(20).optional(),
  qty: z.number().positive("Quantity must be greater than 0"),
  unit: z.string().trim().max(30).optional(),
  rate: z.number().min(0, "Rate can't be negative"),
  gstRate: z.number().min(0).max(100).nullable().optional(),

  // Only meaningful when the invoice's currency !== "INR" — see
  // docs/accounts-payable-phase1-design.md §1.3. The builder computes
  // amountInr = round(amount * exchangeRate, 2) once, client-side,
  // before this schema ever sees the request — same "provenance only"
  // rule as LineItem's own foreignCurrency fields.
  amountInr: z.number().min(0).nullable().optional(),

  // Per-line FC provenance — see PurchaseLineItem.rateFC's own schema
  // comment. Pure display data: amountFC is recomputed server-side from
  // rateFC * qty when rateFC is present (never trusted from the
  // client, same "never trust a client-submitted total" rule as every
  // other computed money field), so whatever the client sends for it
  // is informational only.
  rateFC: z.number().min(0).nullable().optional(),
  exRate: z.number().positive().nullable().optional(),
  fcCurrency: z.string().trim().length(3).nullable().optional(),
  amountFC: z.number().min(0).nullable().optional(),
});

export type PurchaseLineItemInput = z.infer<typeof purchaseLineItemInputSchema>;

export const purchaseInvoiceUpdateSchema = z.object({
  vendorId: z.string().min(1).optional(),
  vendorInvoiceNumber: z.string().trim().min(1).max(100).optional(),
  vendorInvoiceDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().nullable().optional(),

  currency: z.string().trim().min(3).max(3).optional(),
  exchangeRate: z.number().positive().nullable().optional(),

  roundTotal: z.boolean().optional(),

  shipmentMode: z.string().trim().max(200).nullable().optional(),
  vesselVoyage: z.string().trim().max(200).nullable().optional(),
  sailedDate: z.coerce.date().nullable().optional(),
  portOfLoading: z.string().trim().max(200).nullable().optional(),
  portOfDischarge: z.string().trim().max(200).nullable().optional(),
  originPort: z.string().trim().max(200).nullable().optional(),
  placeOfDelivery: z.string().trim().max(200).nullable().optional(),
  shipper: z.string().trim().max(200).nullable().optional(),
  ciReference: z.string().trim().max(200).nullable().optional(),
  salesPerson: z.string().trim().max(200).nullable().optional(),
  containerNo: z.string().trim().max(200).nullable().optional(),
  jobRef: z.string().trim().max(200).nullable().optional(),
  customerRef: z.string().trim().max(200).nullable().optional(),
  packageType: z.string().trim().max(200).nullable().optional(),
  noOfPackages: z.number().min(0).nullable().optional(),
  hbl: z.string().trim().max(200).nullable().optional(),
  mbl: z.string().trim().max(200).nullable().optional(),
  weightKg: z.number().min(0).nullable().optional(),
  chargeableWeight: z.number().min(0).nullable().optional(),
  volumeCbm: z.number().min(0).nullable().optional(),
  customsDocRef: z.string().trim().max(200).nullable().optional(),
  termsOfShipment: z.string().trim().max(200).nullable().optional(),

  notes: z.string().trim().max(2000).nullable().optional(),

  // When present, replaces the invoice's entire line item set — same
  // whole-array-replace semantics as documentUpdateSchema's lineItems.
  lineItems: z.array(purchaseLineItemInputSchema).optional(),
});

export type PurchaseInvoiceUpdateInput = z.infer<typeof purchaseInvoiceUpdateSchema>;

// Creation accepts the full payload in one call — vendorId plus every
// field purchaseInvoiceUpdateSchema accepts (vendorId itself becomes
// required here). A caller that only wants the minimal "empty draft,
// then PATCH content in" flow the builder UI uses (design doc §5) can
// still POST with just { vendorId } and everything else omitted/
// optional — nothing about that flow breaks. What changes is that a
// single POST with the full payload (line items, shipment details,
// dates, etc.) now works too, rather than silently dropping every
// field beyond vendorId the way a bare z.object({ vendorId }) schema
// used to (extra keys are stripped, not rejected, by a non-strict zod
// object schema — the exact gap a direct API test surfaced).
export const purchaseInvoiceCreateSchema = purchaseInvoiceUpdateSchema.extend({
  vendorId: z.string().min(1, "Select a vendor"),
});

export type PurchaseInvoiceCreateInput = z.infer<typeof purchaseInvoiceCreateSchema>;
