ALTER TABLE "FundingRequest"
ADD COLUMN "settlementReference" TEXT,
ADD COLUMN "settledAt" TIMESTAMP(3);

CREATE INDEX "FundingRequest_type_accountMode_status_createdAt_idx"
ON "FundingRequest"("type", "accountMode", "status", "createdAt");