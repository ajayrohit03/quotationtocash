-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('open', 'closed');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "job_id" TEXT;

-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN     "job_id" TEXT;

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "job_ref" TEXT NOT NULL,
    "description" TEXT,
    "status" "job_status" NOT NULL DEFAULT 'open',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_business_id_idx" ON "jobs"("business_id");

-- CreateIndex
CREATE INDEX "jobs_business_id_status_idx" ON "jobs"("business_id", "status");

-- CreateIndex
CREATE INDEX "documents_business_id_job_id_idx" ON "documents"("business_id", "job_id");

-- CreateIndex
CREATE INDEX "purchase_invoices_business_id_job_id_idx" ON "purchase_invoices"("business_id", "job_id");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
