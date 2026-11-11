CREATE TABLE "DiditVerificationSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "workflowId" TEXT NOT NULL,
    "vendorData" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "decision" JSONB,
    "lastEventAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiditVerificationSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiditWebhookEvent" (
    "eventId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "webhookType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiditWebhookEvent_pkey" PRIMARY KEY ("eventId")
);

CREATE UNIQUE INDEX "DiditVerificationSession_sessionId_key"
    ON "DiditVerificationSession"("sessionId");
CREATE INDEX "DiditVerificationSession_userId_createdAt_idx"
    ON "DiditVerificationSession"("userId", "createdAt");
CREATE INDEX "DiditWebhookEvent_sessionId_createdAt_idx"
    ON "DiditWebhookEvent"("sessionId", "createdAt");

ALTER TABLE "DiditVerificationSession"
    ADD CONSTRAINT "DiditVerificationSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
