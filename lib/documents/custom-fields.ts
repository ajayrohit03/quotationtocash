import { z } from "zod";
import { formatDateIST } from "@/lib/dates";

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

// The builder constructs this verbatim from its currently-loaded
// definitions + entered values (§4) — the server validates shape and
// that each definitionId is a real document-scope definition belonging
// to this business (see PATCH /api/documents/:id), but doesn't rebuild
// the snapshot itself, same "compute once at entry time" rule as
// multi-currency's exchangeRate (§2).
export const customFieldValueSnapshotSchema = z.object({
  definitionId: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "number", "date"]),
  value: z.union([z.string(), z.number()]).nullable(),
  sortOrder: z.number().int(),
});

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
