-- CreateEnum
CREATE TYPE "einvoice_status" AS ENUM ('none', 'pending', 'generated', 'cancelled');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "einvoicing_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "irp_client_id" TEXT,
ADD COLUMN     "irp_client_secret" TEXT,
ADD COLUMN     "irp_gstin" TEXT,
ADD COLUMN     "irp_username" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "einvoice_qr_code" TEXT,
ADD COLUMN     "einvoice_status" "einvoice_status" NOT NULL DEFAULT 'none',
ADD COLUMN     "irn" TEXT,
ADD COLUMN     "irn_ack_date" TEXT,
ADD COLUMN     "irn_ack_no" TEXT,
ADD COLUMN     "irn_generated_at" TIMESTAMP(3);
