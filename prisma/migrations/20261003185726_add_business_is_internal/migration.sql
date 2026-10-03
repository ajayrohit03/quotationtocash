-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "is_internal" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: automated test fixtures all use @example.invalid emails
-- (see docs/analytics-dashboard-design.md §3); flag them so existing test
-- rows don't pollute analytics from day one.
UPDATE "businesses" SET "is_internal" = true WHERE "email" LIKE '%@example.invalid';
