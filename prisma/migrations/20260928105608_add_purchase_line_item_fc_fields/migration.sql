-- AlterTable
ALTER TABLE "purchase_line_items" ADD COLUMN     "amount_fc" DECIMAL(12,2),
ADD COLUMN     "ex_rate" DECIMAL(12,6),
ADD COLUMN     "fc_currency" TEXT,
ADD COLUMN     "rate_fc" DECIMAL(12,2);
