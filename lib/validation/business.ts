import { z } from "zod";
import { GST_REGISTRATION_TYPES, INDIAN_STATES } from "@/lib/constants/indian-states";

// Official GSTIN format: 2-digit state code, 10-char PAN, 1-digit entity
// code, 'Z' by default, 1 checksum char.
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const businessCreateSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(200),
  email: z.email("Enter a valid email"),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  website: z.string().trim().max(300).optional(),
});

export type BusinessCreateInput = z.infer<typeof businessCreateSchema>;

export const businessUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.email().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  website: z.string().trim().max(300).nullable().optional(),
  logoUrl: z.string().trim().max(2000).nullable().optional(),

  // GST fields are intentionally not here — they have cross-field rules
  // (GSTIN/rate/place/registration are required together, and disabling
  // GST should clear them) that don't fit a plain partial-update schema.
  // See gstSetupSchema and PATCH /api/business/gst.
  documentTemplate: z.enum(["classic", "modern", "minimal"]).optional(),
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #4F46E5")
    .optional(),

  // Pre-fill defaults for new documents only — never applied
  // retroactively (see the field comments in schema.prisma).
  defaultPaymentTerms: z.string().trim().max(500).nullable().optional(),
  defaultValidityTerms: z.string().trim().max(500).nullable().optional(),
  defaultNotes: z.string().trim().max(2000).nullable().optional(),
  defaultTermsText: z.string().trim().max(2000).nullable().optional(),
});

export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;

// Used by the onboarding GST step (and later Settings > Tax) — stricter
// than businessUpdateSchema's permissive per-field optionality, since here
// we know exactly which fields the form is submitting together.
export const gstSetupSchema = z.discriminatedUnion("gstEnabled", [
  z.object({
    gstEnabled: z.literal(false),
  }),
  z.object({
    gstEnabled: z.literal(true),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(GSTIN_REGEX, "Enter a valid 15-character GSTIN"),
    gstDefaultRate: z.number().min(0).max(100),
    placeOfSupply: z.enum(INDIAN_STATES),
    registrationType: z.enum(GST_REGISTRATION_TYPES),
  }),
]);

export type GstSetupInput = z.infer<typeof gstSetupSchema>;

// Bank/payment details — same "financial weight" tier as GST, so this
// stays on its own owner-only route (app/api/business/payment-details/
// route.ts) rather than folding into businessUpdateSchema's Admin-
// delegable PATCH. All fields optional: filling in zero of them must
// never block creating or sending a document. IFSC's 11-character format
// is a soft UI hint only (see payment-tab.tsx) — deliberately not
// enforced here, since a formatting quibble shouldn't block saving real
// account details a business already has correct.
export const paymentDetailsSchema = z.object({
  bankName: z.string().trim().max(200).nullable().optional(),
  accountHolderName: z.string().trim().max(200).nullable().optional(),
  accountNumber: z.string().trim().max(50).nullable().optional(),
  ifscCode: z.string().trim().max(20).nullable().optional(),
  upiId: z.string().trim().max(100).nullable().optional(),
});

export type PaymentDetailsInput = z.infer<typeof paymentDetailsSchema>;

export const templateSetupSchema = z.object({
  documentTemplate: z.enum(["classic", "modern", "minimal"]),
});

export type TemplateSetupInput = z.infer<typeof templateSetupSchema>;
