-- DropIndex
DROP INDEX "payments_invoice_id_idx";

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "note" TEXT,
ADD COLUMN     "recorded_by_user_id" TEXT;

-- CreateIndex
CREATE INDEX "payments_invoice_id_paid_at_idx" ON "payments"("invoice_id", "paid_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: see docs/payment-tracking-design.md §4. Every pre-existing
-- invoice already at status = 'paid' gets exactly one Payment row
-- recording the full total, using updated_at as the best available
-- (not fabricated) proxy for when it was marked paid. recorded_by_user_id
-- stays NULL — no real recorder is known for these. status is left
-- untouched; this only makes the ledger consistent with it.
INSERT INTO "payments" ("id", "invoice_id", "amount", "paid_at", "note", "created_at")
SELECT
  gen_random_uuid(),
  "id",
  "total",
  "updated_at",
  'Backfilled at payment-tracking migration — original payment date/recorder unknown; using the invoice''s last-updated timestamp.',
  now()
FROM "documents"
WHERE "type" = 'invoice' AND "status" = 'paid';

UPDATE "documents"
SET "amount_paid" = "total"
WHERE "type" = 'invoice' AND "status" = 'paid';
