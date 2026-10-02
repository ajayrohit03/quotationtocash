-- CreateEnum
CREATE TYPE "plan" AS ENUM ('free', 'starter', 'growth', 'enterprise');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "plan" "plan" NOT NULL DEFAULT 'free',
ADD COLUMN     "plan_note" TEXT,
ADD COLUMN     "plan_overrides" JSONB,
ADD COLUMN     "plan_updated_at" TIMESTAMP(3),
ADD COLUMN     "plan_updated_by_user_id" TEXT;
