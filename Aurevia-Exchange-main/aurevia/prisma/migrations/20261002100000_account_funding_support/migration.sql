CREATE TYPE "AccountMode" AS ENUM ('DEMO', 'REAL');
CREATE TYPE "SupportStatus" AS ENUM ('AWAITING_ADMIN', 'AWAITING_USER', 'RESOLVED');
CREATE TYPE "SupportAuthor" AS ENUM ('USER', 'ADMIN', 'NOVA');

ALTER TYPE "FundingStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
ALTER TYPE "FundingStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "FundingStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "FundingStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "User" ADD COLUMN "accountMode" "AccountMode" NOT NULL DEFAULT 'DEMO';
ALTER TABLE "Order" ADD COLUMN "accountMode" "AccountMode" NOT NULL DEFAULT 'DEMO';
ALTER TABLE "Position" ADD COLUMN "accountMode" "AccountMode" NOT NULL DEFAULT 'DEMO';
ALTER TABLE "LedgerAccount" ADD COLUMN "accountMode" "AccountMode" NOT NULL DEFAULT 'DEMO';
ALTER TABLE "FundingRequest"
  ADD COLUMN "accountMode" "AccountMode" NOT NULL DEFAULT 'DEMO',
  ADD COLUMN "paymentMethodId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "transactionReference" TEXT,
  ADD COLUMN "referenceInfo" TEXT,
  ADD COLUMN "destinationInfo" TEXT,
  ADD COLUMN "senderInfo" TEXT,
  ADD COLUMN "beneficiaryInfo" TEXT,
  ADD COLUMN "network" TEXT,
  ADD COLUMN "adminNote" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

UPDATE "LedgerAccount"
SET "code" = left("code", length("code") - 3) || 'DEMO:USD'
WHERE "code" LIKE 'USER:%:USD';

CREATE TABLE "PaymentMethod" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "depositEnabled" BOOLEAN NOT NULL DEFAULT true,
  "withdrawalEnabled" BOOLEAN NOT NULL DEFAULT true,
  "requiresNetwork" BOOLEAN NOT NULL DEFAULT false,
  "currencies" TEXT[] NOT NULL DEFAULT ARRAY['USD']::TEXT[],
  "destination" TEXT,
  "instructions" TEXT,
  "minimumAmount" DECIMAL(30,10) NOT NULL DEFAULT 0,
  "maximumAmount" DECIMAL(30,10),
  "processingNotes" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportConversation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accountMode" "AccountMode" NOT NULL DEFAULT 'DEMO',
  "subject" TEXT NOT NULL,
  "status" "SupportStatus" NOT NULL DEFAULT 'AWAITING_ADMIN',
  "transactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "authorType" "SupportAuthor" NOT NULL,
  "authorId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FundingRequest_idempotencyKey_key" ON "FundingRequest"("idempotencyKey");
CREATE INDEX "FundingRequest_userId_accountMode_createdAt_idx" ON "FundingRequest"("userId", "accountMode", "createdAt");
CREATE INDEX "PaymentMethod_enabled_displayOrder_idx" ON "PaymentMethod"("enabled", "displayOrder");
CREATE INDEX "SupportConversation_userId_createdAt_idx" ON "SupportConversation"("userId", "createdAt");
CREATE INDEX "SupportConversation_status_lastMessageAt_idx" ON "SupportConversation"("status", "lastMessageAt");
CREATE INDEX "SupportMessage_conversationId_createdAt_idx" ON "SupportMessage"("conversationId", "createdAt");

ALTER TABLE "FundingRequest" ADD CONSTRAINT "FundingRequest_paymentMethodId_fkey"
  FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportConversation" ADD CONSTRAINT "SupportConversation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportConversation" ADD CONSTRAINT "SupportConversation_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "FundingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;