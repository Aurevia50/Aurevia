ALTER TABLE "Order"
    ADD COLUMN "providerName" TEXT,
    ADD COLUMN "providerOrderId" TEXT,
    ADD COLUMN "providerStatus" TEXT,
    ADD COLUMN "providerAcceptedAt" TIMESTAMP(3),
    ADD COLUMN "providerUpdatedAt" TIMESTAMP(3),
    ADD COLUMN "reconciliationStatus" TEXT,
    ADD COLUMN "reconciledAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Order_providerOrderId_key" ON "Order"("providerOrderId");
CREATE INDEX "Order_accountMode_providerName_providerStatus_idx"
    ON "Order"("accountMode", "providerName", "providerStatus");

ALTER TABLE "Execution" ADD COLUMN "providerExecutionId" TEXT;
CREATE UNIQUE INDEX "Execution_providerExecutionId_key" ON "Execution"("providerExecutionId");
