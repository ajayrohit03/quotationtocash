-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

-- AlterEnum
ALTER TYPE "business_role" ADD VALUE 'admin';

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "business_role" NOT NULL DEFAULT 'staff',
    "title" TEXT,
    "reports_to_id" TEXT,
    "token_hash" TEXT NOT NULL,
    "status" "invitation_status" NOT NULL DEFAULT 'pending',
    "invited_by_user_id" TEXT NOT NULL,
    "accepted_by_user_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_hits" (
    "id" TEXT NOT NULL,
    "bucket_key" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_business_id_idx" ON "invitations"("business_id");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_hits_bucket_key_window_start_key" ON "rate_limit_hits"("bucket_key", "window_start");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_reports_to_id_fkey" FOREIGN KEY ("reports_to_id") REFERENCES "business_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-added (not Prisma-generated): "at most one pending invitation per
-- business+email" can't be expressed as a plain @@unique — a declined,
-- expired, or revoked invite must not permanently block re-inviting that
-- address. A partial index scoped to status = 'pending' is the DB-level
-- guarantee against a create/create race; see
-- docs/invitation-onboarding-design.md §2.
CREATE UNIQUE INDEX "invitations_pending_business_email_key"
  ON "invitations" ("business_id", lower("email"))
  WHERE "status" = 'pending';
