-- AlterTable
ALTER TABLE "businesses" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

