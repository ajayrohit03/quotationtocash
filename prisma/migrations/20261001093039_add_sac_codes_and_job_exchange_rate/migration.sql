-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "exchange_rate" DECIMAL(12,6);

-- AlterTable
ALTER TABLE "line_items" ADD COLUMN     "sac" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "sac_code" TEXT;
