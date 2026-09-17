-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "inr_exchange_rate" DECIMAL(12,6),
ADD COLUMN     "lut_declaration_text" TEXT DEFAULT 'Supply meant for export under Letter of Undertaking (LUT) without payment of Integrated Tax.',
ADD COLUMN     "show_inr_equivalent" BOOLEAN NOT NULL DEFAULT false;
