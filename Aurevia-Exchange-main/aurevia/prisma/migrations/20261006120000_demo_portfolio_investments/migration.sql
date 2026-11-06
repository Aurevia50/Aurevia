CREATE TYPE "InvestmentRisk" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'VERY_HIGH');
CREATE TYPE "InvestmentOpportunityStatus" AS ENUM ('DRAFT', 'AVAILABLE', 'PAUSED', 'CLOSED');
CREATE TYPE "InvestmentStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'SETTLED');

ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

CREATE TABLE "InvestmentOpportunity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assetSymbol" TEXT,
    "minimumAmount" DECIMAL(30,10) NOT NULL,
    "maximumAmount" DECIMAL(30,10),
    "targetReturnPercent" DECIMAL(10,6),
    "durationDays" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3),
    "maturesAt" TIMESTAMP(3),
    "riskLevel" "InvestmentRisk" NOT NULL,
    "status" "InvestmentOpportunityStatus" NOT NULL DEFAULT 'DRAFT',
    "demoEligible" BOOLEAN NOT NULL DEFAULT true,
    "realEligible" BOOLEAN NOT NULL DEFAULT false,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "targetPrice" DECIMAL(30,10),
    "stopPrice" DECIMAL(30,10),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvestmentOpportunity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvestmentOpportunity_amount_range_check" CHECK ("minimumAmount" > 0 AND ("maximumAmount" IS NULL OR "maximumAmount" >= "minimumAmount")),
    CONSTRAINT "InvestmentOpportunity_duration_check" CHECK ("durationDays" > 0)
);

CREATE INDEX "InvestmentOpportunity_status_createdAt_idx" ON "InvestmentOpportunity"("status", "createdAt");
CREATE INDEX "InvestmentOpportunity_assetSymbol_status_idx" ON "InvestmentOpportunity"("assetSymbol", "status");

ALTER TABLE "InvestmentOpportunity"
ADD CONSTRAINT "InvestmentOpportunity_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InvestmentRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "accountMode" "AccountMode" NOT NULL,
    "amount" DECIMAL(30,10) NOT NULL,
    "status" "InvestmentStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "idempotencyKey" TEXT NOT NULL,
    "targetReturnPercent" DECIMAL(10,6),
    "durationDays" INTEGER NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "maturesAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "externalExecutionReference" TEXT,
    "settlementReference" TEXT,
    "simulatedPayout" DECIMAL(30,10),
    "adminNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvestmentRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvestmentRequest_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "InvestmentRequest_duration_check" CHECK ("durationDays" > 0)
);

CREATE UNIQUE INDEX "InvestmentRequest_idempotencyKey_key" ON "InvestmentRequest"("idempotencyKey");
CREATE INDEX "InvestmentRequest_userId_accountMode_status_requestedAt_idx" ON "InvestmentRequest"("userId", "accountMode", "status", "requestedAt");
CREATE INDEX "InvestmentRequest_opportunityId_status_requestedAt_idx" ON "InvestmentRequest"("opportunityId", "status", "requestedAt");

ALTER TABLE "InvestmentRequest"
ADD CONSTRAINT "InvestmentRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestmentRequest"
ADD CONSTRAINT "InvestmentRequest_opportunityId_fkey"
FOREIGN KEY ("opportunityId") REFERENCES "InvestmentOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountMode" "AccountMode" NOT NULL,
    "snapshotBucket" TIMESTAMP(3) NOT NULL,
    "cashBalance" DECIMAL(30,10) NOT NULL,
    "positionValue" DECIMAL(30,10) NOT NULL,
    "investmentValue" DECIMAL(30,10) NOT NULL,
    "totalValue" DECIMAL(30,10) NOT NULL,
    "realizedPnl" DECIMAL(30,10) NOT NULL,
    "unrealizedPnl" DECIMAL(30,10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioSnapshot_userId_accountMode_snapshotBucket_key" ON "PortfolioSnapshot"("userId", "accountMode", "snapshotBucket");
CREATE INDEX "PortfolioSnapshot_accountMode_snapshotBucket_idx" ON "PortfolioSnapshot"("accountMode", "snapshotBucket");

ALTER TABLE "PortfolioSnapshot"
ADD CONSTRAINT "PortfolioSnapshot_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
