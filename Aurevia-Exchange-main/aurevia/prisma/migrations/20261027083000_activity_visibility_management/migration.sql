ALTER TABLE "Notification" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN "accountMode" "AccountMode";

UPDATE "Notification" AS notification
SET "accountMode" = "Order"."accountMode"
FROM "Order"
WHERE notification."relatedEntity" = 'ORDER'
  AND notification."relatedId" = "Order"."id"
  AND notification."accountMode" IS NULL;

UPDATE "Notification" AS notification
SET "accountMode" = "FundingRequest"."accountMode"
FROM "FundingRequest"
WHERE notification."relatedEntity" = 'FUNDING'
  AND notification."relatedId" = "FundingRequest"."id"
  AND notification."accountMode" IS NULL;

UPDATE "Notification" AS notification
SET "accountMode" = "InvestmentRequest"."accountMode"
FROM "InvestmentRequest"
WHERE notification."relatedEntity" = 'INVESTMENT'
  AND notification."relatedId" = "InvestmentRequest"."id"
  AND notification."accountMode" IS NULL;

UPDATE "Notification" AS notification
SET "accountMode" = "LedgerTransaction"."accountMode"
FROM "LedgerTransaction"
WHERE notification."relatedEntity" = 'LEDGER_TRANSACTION'
  AND notification."relatedId" = "LedgerTransaction"."id"
  AND notification."accountMode" IS NULL;

CREATE TABLE "ActivityVisibilityPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountMode" "AccountMode" NOT NULL,
    "sourceType" VARCHAR(32) NOT NULL,
    "sourceId" VARCHAR(128) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityVisibilityPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActivityVisibilityPreference_userId_accountMode_sourceType_sourceId_key"
ON "ActivityVisibilityPreference"("userId", "accountMode", "sourceType", "sourceId");

CREATE INDEX "ActivityVisibilityPreference_userId_accountMode_archivedAt_hiddenAt_idx"
ON "ActivityVisibilityPreference"("userId", "accountMode", "archivedAt", "hiddenAt");

CREATE INDEX "Notification_userId_archivedAt_createdAt_idx"
ON "Notification"("userId", "archivedAt", "createdAt");

CREATE INDEX "Notification_userId_accountMode_createdAt_idx"
ON "Notification"("userId", "accountMode", "createdAt");

ALTER TABLE "ActivityVisibilityPreference"
ADD CONSTRAINT "ActivityVisibilityPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
