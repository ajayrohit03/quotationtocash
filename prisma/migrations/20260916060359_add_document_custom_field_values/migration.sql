-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "custom_field_values" JSONB NOT NULL DEFAULT '[]';
