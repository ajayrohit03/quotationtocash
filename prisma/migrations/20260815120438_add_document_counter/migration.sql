-- CreateTable
CREATE TABLE "document_counters" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "type" "document_type" NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_counters_business_id_type_year_key" ON "document_counters"("business_id", "type", "year");

-- AddForeignKey
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
