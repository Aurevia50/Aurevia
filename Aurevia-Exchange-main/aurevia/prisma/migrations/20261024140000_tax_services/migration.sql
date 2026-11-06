-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TAX';

CREATE TYPE "TaxCaseStatus" AS ENUM ('DRAFT','SUBMITTED','AWAITING_INITIAL_REVIEW','UNDER_REVIEW','AWAITING_TAXPAYER_INFO','INFORMATION_RECEIVED','REVIEW_COMPLETED','PREPARATION_COMPLETED','CLOSED','CANCELLED','DECLINED');
CREATE TYPE "TaxServiceType" AS ENUM ('FEDERAL_RETURN_PREPARATION','FEDERAL_RETURN_REVIEW','AMENDED_RETURN_INTAKE','PRIOR_YEAR_PREPARATION','DOCUMENT_ORGANIZATION','IRS_NOTICE_REVIEW','OTHER');
CREATE TYPE "TaxDocumentCategory" AS ENUM ('W2','FORM_1099','PRIOR_YEAR_RETURN','IDENTITY','DEPENDENT_SUPPORT','DEDUCTION_EVIDENCE','ESTIMATED_TAX_PAYMENT','IRS_NOTICE','INVESTMENT_RECORDS','OTHER');

CREATE TABLE "TaxModuleSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" TEXT,
  CONSTRAINT "TaxModuleSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaxServiceAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "allowedServices" TEXT NOT NULL DEFAULT '[]',
  "grantedById" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "TaxServiceAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaxCase" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "TaxCaseStatus" NOT NULL DEFAULT 'DRAFT',
  "serviceType" "TaxServiceType" NOT NULL,
  "taxYear" INTEGER NOT NULL,
  "returnKind" TEXT NOT NULL DEFAULT 'ORIGINAL',
  "filingDeadline" TIMESTAMP(3),
  "reason" TEXT,
  "priorReturnFiled" BOOLEAN,
  "receivedIrsNotice" BOOLEAN,
  "specialCircumstances" TEXT,
  "intakeJson" TEXT NOT NULL DEFAULT '{}',
  "acknowledgmentAt" TIMESTAMP(3),
  "acknowledgmentText" TEXT,
  "assigneeId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaxCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaxCaseDocument" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" "TaxDocumentCategory" NOT NULL DEFAULT 'OTHER',
  "description" TEXT,
  "taxYear" INTEGER,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "TaxCaseDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaxCaseMessage" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'USER',
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaxCaseMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaxCaseStatusEvent" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "fromStatus" "TaxCaseStatus",
  "toStatus" "TaxCaseStatus" NOT NULL,
  "actorId" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaxCaseStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaxServiceAccess_userId_key" ON "TaxServiceAccess"("userId");
CREATE INDEX "TaxServiceAccess_enabled_updatedAt_idx" ON "TaxServiceAccess"("enabled", "updatedAt");
CREATE UNIQUE INDEX "TaxCase_reference_key" ON "TaxCase"("reference");
CREATE INDEX "TaxCase_userId_status_updatedAt_idx" ON "TaxCase"("userId", "status", "updatedAt");
CREATE INDEX "TaxCase_status_submittedAt_idx" ON "TaxCase"("status", "submittedAt");
CREATE INDEX "TaxCase_taxYear_serviceType_idx" ON "TaxCase"("taxYear", "serviceType");
CREATE UNIQUE INDEX "TaxCaseDocument_storageKey_key" ON "TaxCaseDocument"("storageKey");
CREATE INDEX "TaxCaseDocument_caseId_uploadedAt_idx" ON "TaxCaseDocument"("caseId", "uploadedAt");
CREATE INDEX "TaxCaseDocument_userId_uploadedAt_idx" ON "TaxCaseDocument"("userId", "uploadedAt");
CREATE INDEX "TaxCaseMessage_caseId_createdAt_idx" ON "TaxCaseMessage"("caseId", "createdAt");
CREATE INDEX "TaxCaseStatusEvent_caseId_createdAt_idx" ON "TaxCaseStatusEvent"("caseId", "createdAt");

ALTER TABLE "TaxServiceAccess" ADD CONSTRAINT "TaxServiceAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxServiceAccess" ADD CONSTRAINT "TaxServiceAccess_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaxCase" ADD CONSTRAINT "TaxCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxCase" ADD CONSTRAINT "TaxCase_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaxCaseDocument" ADD CONSTRAINT "TaxCaseDocument_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TaxCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxCaseMessage" ADD CONSTRAINT "TaxCaseMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TaxCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxCaseMessage" ADD CONSTRAINT "TaxCaseMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxCaseStatusEvent" ADD CONSTRAINT "TaxCaseStatusEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TaxCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
