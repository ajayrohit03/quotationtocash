-- AlterTable
ALTER TABLE "line_items" ADD COLUMN     "custom_field_values" JSONB NOT NULL DEFAULT '[]';
