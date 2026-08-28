-- AlterTable
ALTER TABLE "users" ADD COLUMN     "dismissed_tutorials" TEXT[] DEFAULT ARRAY[]::TEXT[];
