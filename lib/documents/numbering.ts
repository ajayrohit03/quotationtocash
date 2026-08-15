// Deliberately no `import "server-only"` — pure Prisma logic, no secrets,
// so lib/documents/__tests__/numbering.race.test.ts can exercise it
// directly under Vitest's plain Node environment (matching the precedent
// in lib/auth/user-identity.ts).

import type { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const PREFIXES: Record<DocumentType, string> = {
  quotation: "QT",
  invoice: "INV",
};

// Concurrency-safe: the upsert's increment compiles to a native Postgres
// INSERT ... ON CONFLICT (business_id, type, year) DO UPDATE SET
// last_number = last_number + 1, so two concurrent document creations for
// the same business/type/year can never be handed the same number — there
// is no read-then-write gap for a race to land in.
export async function getNextDocumentNumber(
  businessId: string,
  type: DocumentType,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getFullYear();

  const counter = await prisma.documentCounter.upsert({
    where: { businessId_type_year: { businessId, type, year } },
    create: { businessId, type, year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });

  return `${PREFIXES[type]}-${year}-${String(counter.lastNumber).padStart(4, "0")}`;
}
