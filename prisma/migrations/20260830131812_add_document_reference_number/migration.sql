-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "reference_number" TEXT,
ADD COLUMN     "show_reference_number" BOOLEAN NOT NULL DEFAULT false;
