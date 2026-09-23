-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "round_total" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rounding_adjustment" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "show_discount" BOOLEAN NOT NULL DEFAULT true;
