ALTER TYPE "SupportStatus" ADD VALUE 'OPEN';
ALTER TYPE "SupportStatus" ADD VALUE 'IN_REVIEW';
ALTER TYPE "SupportStatus" ADD VALUE 'WAITING_FOR_USER';
ALTER TYPE "SupportStatus" ADD VALUE 'CLOSED';

CREATE TYPE "SupportPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "TierUpgradeStatus" AS ENUM ('PENDING_REVIEW', 'NEEDS_INFORMATION', 'APPROVED', 'REJECTED');

ALTER TABLE "SupportConversation"
ADD COLUMN "priority" "SupportPriority" NOT NULL DEFAULT 'NORMAL';

ALTER TABLE "User"
ADD COLUMN "approvedTier" INTEGER NOT NULL DEFAULT 1,
ADD CONSTRAINT "User_approvedTier_check" CHECK ("approvedTier" BETWEEN 1 AND 3);

CREATE TABLE "TierUpgradeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentTier" INTEGER NOT NULL,
    "requestedTier" INTEGER NOT NULL,
    "status" "TierUpgradeStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "userMessage" VARCHAR(1000),
    "adminReason" VARCHAR(1000),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TierUpgradeRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TierUpgradeRequest_step_check" CHECK (
        "currentTier" BETWEEN 1 AND 2
        AND "requestedTier" = "currentTier" + 1
    )
);

ALTER TABLE "TierUpgradeRequest" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "SupportConversation_priority_status_lastMessageAt_idx"
ON "SupportConversation"("priority", "status", "lastMessageAt");
CREATE INDEX "TierUpgradeRequest_userId_status_createdAt_idx"
ON "TierUpgradeRequest"("userId", "status", "createdAt");
CREATE INDEX "TierUpgradeRequest_status_createdAt_idx"
ON "TierUpgradeRequest"("status", "createdAt");
CREATE UNIQUE INDEX "TierUpgradeRequest_one_open_request_per_user_idx"
ON "TierUpgradeRequest"("userId")
WHERE "status" IN ('PENDING_REVIEW', 'NEEDS_INFORMATION');

ALTER TABLE "TierUpgradeRequest"
ADD CONSTRAINT "TierUpgradeRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TierUpgradeRequest"
ADD CONSTRAINT "TierUpgradeRequest_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
