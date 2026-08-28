-- CreateIndex
CREATE INDEX "documents_business_id_type_created_at_idx" ON "documents"("business_id", "type", "created_at");
