-- CreateEnum
CREATE TYPE "custom_field_type" AS ENUM ('text', 'number', 'date');

-- CreateEnum
CREATE TYPE "custom_field_scope" AS ENUM ('document', 'lineItem');

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "custom_field_type" NOT NULL,
    "scope" "custom_field_scope" NOT NULL,
    "applies_to" "document_type",
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_field_definitions_business_id_scope_idx" ON "custom_field_definitions"("business_id", "scope");

-- AddForeignKey
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
