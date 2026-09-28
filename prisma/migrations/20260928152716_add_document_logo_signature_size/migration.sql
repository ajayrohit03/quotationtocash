-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "logo_size" "asset_size" NOT NULL DEFAULT 'md',
ADD COLUMN     "signature_size" "asset_size" NOT NULL DEFAULT 'md';
