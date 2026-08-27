-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "default_notes" TEXT,
ADD COLUMN     "default_payment_terms" TEXT,
ADD COLUMN     "default_terms_text" TEXT,
ADD COLUMN     "default_validity_terms" TEXT;
