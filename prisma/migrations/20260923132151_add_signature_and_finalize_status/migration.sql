-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "signature_designation" TEXT,
ADD COLUMN     "signature_image_url" TEXT,
ADD COLUMN     "signature_signatory_name" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "show_signature" BOOLEAN NOT NULL DEFAULT true;
