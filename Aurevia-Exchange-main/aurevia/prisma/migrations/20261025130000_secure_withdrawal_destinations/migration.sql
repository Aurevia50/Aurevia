CREATE TYPE "WithdrawalDestinationType" AS ENUM ('BANK_TRANSFER', 'CRYPTOCURRENCY');

CREATE TABLE "WithdrawalDestination" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountMode" "AccountMode" NOT NULL,
    "type" "WithdrawalDestinationType" NOT NULL,
    "nickname" VARCHAR(80) NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "network" VARCHAR(60),
    "asset" VARCHAR(12),
    "maskedLabel" VARCHAR(180) NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" VARCHAR(32) NOT NULL,
    "authTag" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalDestination_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FundingRequest"
    ADD COLUMN "processingReference" TEXT,
    ADD COLUMN "processingConfirmedAt" TIMESTAMP(3),
    ADD COLUMN "withdrawalDestinationId" TEXT;

CREATE TABLE "WithdrawalDestinationSnapshot" (
    "fundingRequestId" TEXT NOT NULL,
    "type" "WithdrawalDestinationType" NOT NULL,
    "nickname" VARCHAR(80) NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "network" VARCHAR(60),
    "asset" VARCHAR(12),
    "maskedLabel" VARCHAR(180) NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" VARCHAR(32) NOT NULL,
    "authTag" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalDestinationSnapshot_pkey" PRIMARY KEY ("fundingRequestId")
);

CREATE INDEX "WithdrawalDestination_userId_accountMode_updatedAt_idx"
    ON "WithdrawalDestination"("userId", "accountMode", "updatedAt");

CREATE INDEX "FundingRequest_withdrawalDestinationId_idx"
    ON "FundingRequest"("withdrawalDestinationId");

ALTER TABLE "WithdrawalDestination"
    ADD CONSTRAINT "WithdrawalDestination_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FundingRequest"
    ADD CONSTRAINT "FundingRequest_withdrawalDestinationId_fkey"
    FOREIGN KEY ("withdrawalDestinationId") REFERENCES "WithdrawalDestination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WithdrawalDestinationSnapshot"
    ADD CONSTRAINT "WithdrawalDestinationSnapshot_fundingRequestId_fkey"
    FOREIGN KEY ("fundingRequestId") REFERENCES "FundingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
