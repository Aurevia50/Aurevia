CREATE TYPE "ClientStoryStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

CREATE TABLE "ClientStory" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "cityOrRegion" TEXT,
    "quote" TEXT NOT NULL,
    "imageReference" TEXT,
    "userId" TEXT,
    "verifiedWithdrawalId" TEXT,
    "withdrawalAmount" DECIMAL(30,10),
    "currency" TEXT,
    "verifiedClient" BOOLEAN NOT NULL DEFAULT false,
    "transactionVerified" BOOLEAN NOT NULL DEFAULT false,
    "consentConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "showWithdrawalAmount" BOOLEAN NOT NULL DEFAULT false,
    "displayCurrency" TEXT,
    "publicationStatus" "ClientStoryStatus" NOT NULL DEFAULT 'DRAFT',
    "source" TEXT,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientStory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientStory_verifiedWithdrawalId_key" ON "ClientStory"("verifiedWithdrawalId");
CREATE INDEX "ClientStory_publicationStatus_createdAt_idx" ON "ClientStory"("publicationStatus", "createdAt");
CREATE INDEX "ClientStory_userId_idx" ON "ClientStory"("userId");

ALTER TABLE "ClientStory" ADD CONSTRAINT "ClientStory_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientStory" ADD CONSTRAINT "ClientStory_verifiedWithdrawalId_fkey"
FOREIGN KEY ("verifiedWithdrawalId") REFERENCES "FundingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientStory" ENABLE ROW LEVEL SECURITY;