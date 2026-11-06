ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PENDING_CANCEL';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "Position" ADD COLUMN "providerName" TEXT;
ALTER TABLE "Order" ADD COLUMN "providerClientOrderId" TEXT;

CREATE INDEX "Position_userId_accountMode_providerName_status_idx"
ON "Position"("userId", "accountMode", "providerName", "status");

CREATE UNIQUE INDEX "Order_providerClientOrderId_key"
ON "Order"("providerClientOrderId");
