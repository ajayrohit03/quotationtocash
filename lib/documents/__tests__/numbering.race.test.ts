import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getNextDocumentNumber } from "@/lib/documents/numbering";

// Runs against the real database (see lib/auth/__tests__/session.race.test.ts
// for why: proving the atomic-upsert increment actually holds under
// concurrency against real Postgres, not just against our assumptions).
const createdBusinessIds: string[] = [];

afterEach(async () => {
  if (createdBusinessIds.length > 0) {
    await prisma.business.deleteMany({
      where: { id: { in: createdBusinessIds } },
    });
    createdBusinessIds.length = 0;
  }
});

async function createTestBusiness() {
  const business = await prisma.business.create({
    data: {
      name: `Numbering Test ${randomUUID()}`,
      email: `numbering-test-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);
  return business;
}

describe("getNextDocumentNumber", () => {
  it("hands out sequential, unique numbers under concurrent calls", async () => {
    const business = await createTestBusiness();
    const now = new Date();

    const numbers = await Promise.all(
      Array.from({ length: 10 }, () =>
        getNextDocumentNumber(business.id, "invoice", now),
      ),
    );

    // All ten must be distinct — the whole point of the atomic increment.
    expect(new Set(numbers).size).toBe(10);

    const year = now.getFullYear();
    const suffixes = numbers
      .map((n) => Number(n.split("-")[2]))
      .sort((a, b) => a - b);
    expect(suffixes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(numbers.every((n) => n.startsWith(`INV-${year}-`))).toBe(true);
  });

  it("keeps quotation and invoice sequences independent", async () => {
    const business = await createTestBusiness();
    const now = new Date();

    const [qt1, inv1, qt2] = await Promise.all([
      getNextDocumentNumber(business.id, "quotation", now),
      getNextDocumentNumber(business.id, "invoice", now),
      getNextDocumentNumber(business.id, "quotation", now),
    ]);

    expect(qt1.startsWith("QT-")).toBe(true);
    expect(inv1.startsWith("INV-")).toBe(true);
    expect(qt2.startsWith("QT-")).toBe(true);
    // Both quotation numbers landed in the 1/2 range, unaffected by the
    // interleaved invoice call.
    const qtSuffixes = [qt1, qt2]
      .map((n) => Number(n.split("-")[2]))
      .sort((a, b) => a - b);
    expect(qtSuffixes).toEqual([1, 2]);
  });
});
