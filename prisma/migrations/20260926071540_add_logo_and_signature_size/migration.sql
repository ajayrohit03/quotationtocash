-- CreateEnum
CREATE TYPE "asset_size" AS ENUM ('sm', 'md', 'lg', 'xl');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "logo_size" "asset_size" NOT NULL DEFAULT 'md',
ADD COLUMN     "signature_size" "asset_size" NOT NULL DEFAULT 'md';
