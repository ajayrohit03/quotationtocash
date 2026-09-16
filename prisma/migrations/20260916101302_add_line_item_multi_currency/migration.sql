-- AlterTable
ALTER TABLE "line_items" ADD COLUMN     "exchange_rate" DECIMAL(12,6),
ADD COLUMN     "foreign_currency" TEXT,
ADD COLUMN     "foreign_rate" DECIMAL(12,2);
