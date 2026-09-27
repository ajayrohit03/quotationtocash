-- CreateEnum
CREATE TYPE "purchase_invoice_status" AS ENUM ('received', 'approved', 'partially_paid', 'paid', 'cancelled');

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "vendor_invoice_number" TEXT NOT NULL,
    "vendor_invoice_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "status" "purchase_invoice_status" NOT NULL DEFAULT 'received',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxable_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cess" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "round_total" BOOLEAN NOT NULL DEFAULT false,
    "rounding_adjustment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "exchange_rate" DECIMAL(12,6),
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shipment_mode" TEXT,
    "vessel_voyage" TEXT,
    "sailed_date" TIMESTAMP(3),
    "port_of_loading" TEXT,
    "port_of_discharge" TEXT,
    "origin_port" TEXT,
    "place_of_delivery" TEXT,
    "shipper" TEXT,
    "ci_reference" TEXT,
    "sales_person" TEXT,
    "container_no" TEXT,
    "job_ref" TEXT,
    "customer_ref" TEXT,
    "package_type" TEXT,
    "no_of_packages" DECIMAL(12,2),
    "hbl" TEXT,
    "mbl" TEXT,
    "weight_kg" DECIMAL(12,2),
    "chargeable_weight" DECIMAL(12,2),
    "volume_cbm" DECIMAL(12,2),
    "customs_doc_ref" TEXT,
    "terms_of_shipment" TEXT,
    "notes" TEXT,
    "vendor_snapshot" JSONB NOT NULL,
    "business_snapshot" JSONB NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_line_items" (
    "id" TEXT NOT NULL,
    "purchase_invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sac" TEXT,
    "qty" DECIMAL(12,2) NOT NULL,
    "unit" TEXT,
    "rate" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "amount_inr" DECIMAL(12,2),
    "taxable_amount" DECIMAL(12,2) NOT NULL,
    "gst_rate" DECIMAL(5,2),
    "cgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cess" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_invoices_business_id_idx" ON "purchase_invoices"("business_id");

-- CreateIndex
CREATE INDEX "purchase_invoices_business_id_status_idx" ON "purchase_invoices"("business_id", "status");

-- CreateIndex
CREATE INDEX "purchase_invoices_business_id_vendor_id_idx" ON "purchase_invoices"("business_id", "vendor_id");

-- CreateIndex
CREATE INDEX "purchase_invoices_business_id_created_at_idx" ON "purchase_invoices"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "purchase_line_items_purchase_invoice_id_idx" ON "purchase_line_items"("purchase_invoice_id");

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_line_items" ADD CONSTRAINT "purchase_line_items_purchase_invoice_id_fkey" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
