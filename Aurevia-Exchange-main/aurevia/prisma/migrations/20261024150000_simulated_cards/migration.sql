ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CARD';

CREATE TYPE "CardApplicationStatus" AS ENUM ('DRAFT','SUBMITTED','UNDER_REVIEW','AWAITING_INFO','APPROVED','DECLINED','CANCELLED');
CREATE TYPE "SimulatedCardStatus" AS ENUM ('PENDING_ISSUANCE','ACTIVE','SUSPENDED','REVOKED');
CREATE TYPE "CardDesignTier" AS ENUM ('SIGNATURE','GOLD','BLACK');

CREATE TABLE "CardCatalogItem" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "designTier" "CardDesignTier" NOT NULL,
  "displayName" TEXT NOT NULL,
  "description" TEXT,
  "orderPrice" DECIMAL(30,10) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CardCatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CardApplication" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "designTier" "CardDesignTier" NOT NULL,
  "cardholderName" TEXT NOT NULL,
  "status" "CardApplicationStatus" NOT NULL DEFAULT 'DRAFT',
  "priceSnapshot" DECIMAL(30,10) NOT NULL,
  "currencySnapshot" TEXT NOT NULL DEFAULT 'USD',
  "disclosureAccepted" BOOLEAN NOT NULL DEFAULT false,
  "adminNote" TEXT,
  "declineReason" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CardApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SimulatedCard" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "designTier" "CardDesignTier" NOT NULL,
  "displayName" TEXT NOT NULL,
  "cardholderName" TEXT NOT NULL,
  "referenceNumber" TEXT NOT NULL,
  "maskedPan" TEXT NOT NULL,
  "expiryMonth" INTEGER NOT NULL,
  "expiryYear" INTEGER NOT NULL,
  "status" "SimulatedCardStatus" NOT NULL DEFAULT 'ACTIVE',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "suspendedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SimulatedCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CardCatalogItem_key_key" ON "CardCatalogItem"("key");
CREATE INDEX "CardCatalogItem_enabled_designTier_idx" ON "CardCatalogItem"("enabled", "designTier");
CREATE UNIQUE INDEX "CardApplication_reference_key" ON "CardApplication"("reference");
CREATE INDEX "CardApplication_userId_status_createdAt_idx" ON "CardApplication"("userId", "status", "createdAt");
CREATE INDEX "CardApplication_status_submittedAt_idx" ON "CardApplication"("status", "submittedAt");
CREATE INDEX "CardApplication_catalogItemId_status_idx" ON "CardApplication"("catalogItemId", "status");
CREATE UNIQUE INDEX "SimulatedCard_applicationId_key" ON "SimulatedCard"("applicationId");
CREATE UNIQUE INDEX "SimulatedCard_referenceNumber_key" ON "SimulatedCard"("referenceNumber");
CREATE INDEX "SimulatedCard_userId_status_idx" ON "SimulatedCard"("userId", "status");
CREATE INDEX "SimulatedCard_designTier_status_idx" ON "SimulatedCard"("designTier", "status");

ALTER TABLE "CardCatalogItem" ADD CONSTRAINT "CardCatalogItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CardApplication" ADD CONSTRAINT "CardApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardApplication" ADD CONSTRAINT "CardApplication_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CardCatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardApplication" ADD CONSTRAINT "CardApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SimulatedCard" ADD CONSTRAINT "SimulatedCard_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CardApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimulatedCard" ADD CONSTRAINT "SimulatedCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
