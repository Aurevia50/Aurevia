CREATE TYPE "CommunityCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');
CREATE TYPE "LoanStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ACTIVE', 'PAID_OFF');
CREATE TYPE "LoanInstallmentStatus" AS ENUM ('UPCOMING', 'PAID');

ALTER TABLE "FundingRequest"
ADD COLUMN "feeAmount" DECIMAL(30,10),
ADD COLUMN "feePercent" DECIMAL(7,4);

CREATE TABLE "CommunityCampaign" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(3000) NOT NULL,
    "status" "CommunityCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommunityCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityDonation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "amount" DECIMAL(30,10) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "accountMode" "AccountMode" NOT NULL DEFAULT 'REAL',
    "ledgerReference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityDonation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityLoan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "principal" DECIMAL(30,10) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "aprPercent" DECIMAL(7,4) NOT NULL DEFAULT 12,
    "processingFeePercent" DECIMAL(7,4) NOT NULL DEFAULT 2,
    "processingFeeAmount" DECIMAL(30,10),
    "netDisbursedAmount" DECIMAL(30,10),
    "termMonths" INTEGER NOT NULL,
    "monthlyPayment" DECIMAL(30,10) NOT NULL,
    "qualifyingMonths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "LoanStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "idempotencyKey" TEXT,
    "acceptedTermsAt" TIMESTAMP(3) NOT NULL,
    "policyVersion" VARCHAR(32) NOT NULL DEFAULT '2026-10-v1',
    "reviewNote" VARCHAR(500),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "disbursementReference" VARCHAR(180),
    "disbursementNote" VARCHAR(500),
    "disbursedById" TEXT,
    "disbursedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommunityLoan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityLoanInstallment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "principalAmount" DECIMAL(30,10) NOT NULL,
    "interestAmount" DECIMAL(30,10) NOT NULL,
    "totalAmount" DECIMAL(30,10) NOT NULL,
    "lateFeeAmount" DECIMAL(30,10) NOT NULL DEFAULT 0,
    "lateFeeAppliedAt" TIMESTAMP(3),
    "status" "LoanInstallmentStatus" NOT NULL DEFAULT 'UPCOMING',
    "paidAt" TIMESTAMP(3),
    "ledgerReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityLoanInstallment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityLoanPayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "amount" DECIMAL(30,10) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "externalReference" VARCHAR(180) NOT NULL,
    "adminNote" VARCHAR(500),
    "recordedById" TEXT NOT NULL,
    "ledgerReference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityLoanPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityDonation_ledgerReference_key" ON "CommunityDonation"("ledgerReference");
CREATE UNIQUE INDEX "CommunityDonation_idempotencyKey_key" ON "CommunityDonation"("idempotencyKey");
CREATE UNIQUE INDEX "CommunityLoan_idempotencyKey_key" ON "CommunityLoan"("idempotencyKey");
CREATE UNIQUE INDEX "CommunityLoan_disbursementReference_key" ON "CommunityLoan"("disbursementReference");
CREATE UNIQUE INDEX "CommunityLoanInstallment_ledgerReference_key" ON "CommunityLoanInstallment"("ledgerReference");
CREATE UNIQUE INDEX "CommunityLoanInstallment_loanId_number_key" ON "CommunityLoanInstallment"("loanId", "number");
CREATE UNIQUE INDEX "CommunityLoanPayment_ledgerReference_key" ON "CommunityLoanPayment"("ledgerReference");
CREATE UNIQUE INDEX "CommunityLoanPayment_externalReference_key" ON "CommunityLoanPayment"("externalReference");
CREATE INDEX "CommunityCampaign_status_createdAt_idx" ON "CommunityCampaign"("status", "createdAt");
CREATE INDEX "CommunityDonation_userId_createdAt_idx" ON "CommunityDonation"("userId", "createdAt");
CREATE INDEX "CommunityDonation_campaignId_createdAt_idx" ON "CommunityDonation"("campaignId", "createdAt");
CREATE INDEX "CommunityDonation_accountMode_createdAt_idx" ON "CommunityDonation"("accountMode", "createdAt");
CREATE INDEX "CommunityLoan_userId_status_createdAt_idx" ON "CommunityLoan"("userId", "status", "createdAt");
CREATE INDEX "CommunityLoan_status_createdAt_idx" ON "CommunityLoan"("status", "createdAt");
CREATE INDEX "CommunityLoanInstallment_status_dueAt_idx" ON "CommunityLoanInstallment"("status", "dueAt");
CREATE INDEX "CommunityLoanPayment_loanId_createdAt_idx" ON "CommunityLoanPayment"("loanId", "createdAt");
CREATE INDEX "CommunityLoanPayment_installmentId_idx" ON "CommunityLoanPayment"("installmentId");

ALTER TABLE "CommunityCampaign" ADD CONSTRAINT "CommunityCampaign_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityDonation" ADD CONSTRAINT "CommunityDonation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityDonation" ADD CONSTRAINT "CommunityDonation_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "CommunityCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityLoan" ADD CONSTRAINT "CommunityLoan_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityLoan" ADD CONSTRAINT "CommunityLoan_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityLoan" ADD CONSTRAINT "CommunityLoan_disbursedById_fkey"
FOREIGN KEY ("disbursedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityLoanInstallment" ADD CONSTRAINT "CommunityLoanInstallment_loanId_fkey"
FOREIGN KEY ("loanId") REFERENCES "CommunityLoan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityLoanPayment" ADD CONSTRAINT "CommunityLoanPayment_loanId_fkey"
FOREIGN KEY ("loanId") REFERENCES "CommunityLoan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityLoanPayment" ADD CONSTRAINT "CommunityLoanPayment_installmentId_fkey"
FOREIGN KEY ("installmentId") REFERENCES "CommunityLoanInstallment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityLoanPayment" ADD CONSTRAINT "CommunityLoanPayment_recordedById_fkey"
FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
