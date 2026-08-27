-- AlterTable
ALTER TABLE "business_members" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reports_to_id" TEXT,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "created_by_user_id" TEXT;

-- CreateIndex
CREATE INDEX "business_members_business_id_reports_to_id_idx" ON "business_members"("business_id", "reports_to_id");

-- CreateIndex
CREATE INDEX "documents_business_id_created_by_user_id_idx" ON "documents"("business_id", "created_by_user_id");

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_reports_to_id_fkey" FOREIGN KEY ("reports_to_id") REFERENCES "business_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
