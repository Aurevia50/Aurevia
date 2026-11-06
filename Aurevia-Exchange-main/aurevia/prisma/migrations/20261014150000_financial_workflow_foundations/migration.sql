ALTER TABLE "User"
ADD COLUMN "preferredDisplayCurrency" TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE "LedgerAccount"
ADD COLUMN "startingBalance" DECIMAL(30,10) NOT NULL DEFAULT 0;

UPDATE "LedgerAccount"
SET "startingBalance" = 5000
WHERE "accountMode" = 'DEMO'
  AND "currency" = 'USD'
  AND "userId" IS NOT NULL;

UPDATE "LedgerAccount" AS account
SET "startingBalance" = entry."amount"
FROM "LedgerEntry" AS entry
JOIN "LedgerTransaction" AS transaction
  ON transaction."id" = entry."transactionId"
WHERE entry."accountId" = account."id"
  AND entry."type" = 'CREDIT'
  AND account."accountMode" = 'DEMO'
  AND account."currency" = 'USD'
  AND account."userId" IS NOT NULL
  AND transaction."reference" = 'DEMO:STARTING_BALANCE:' || account."userId";

CREATE TABLE "ExchangeRate" (
  "id" TEXT NOT NULL,
  "baseCurrency" TEXT NOT NULL,
  "quoteCurrency" TEXT NOT NULL,
  "rate" DECIMAL(30,12) NOT NULL,
  "source" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExchangeRate_rate_positive" CHECK ("rate" > 0)
);

CREATE UNIQUE INDEX "ExchangeRate_baseCurrency_quoteCurrency_key"
ON "ExchangeRate"("baseCurrency", "quoteCurrency");

CREATE INDEX "ExchangeRate_observedAt_idx" ON "ExchangeRate"("observedAt");
