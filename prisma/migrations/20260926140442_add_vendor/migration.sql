-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "cin" TEXT,
    "bank_name" TEXT,
    "account_holder_name" TEXT,
    "account_number" TEXT,
    "ifsc_code" TEXT,
    "upi_id" TEXT,
    "swift_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendors_business_id_idx" ON "vendors"("business_id");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
