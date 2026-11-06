CREATE TABLE "AdminDashboardActivityDismissal" (
    "id" TEXT NOT NULL,
    "auditLogId" TEXT NOT NULL,
    "hiddenById" TEXT,
    "restoredById" TEXT,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),

    CONSTRAINT "AdminDashboardActivityDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminDashboardActivityDismissal_auditLogId_key"
    ON "AdminDashboardActivityDismissal"("auditLogId");

CREATE INDEX "AdminDashboardActivityDismissal_restoredAt_hiddenAt_idx"
    ON "AdminDashboardActivityDismissal"("restoredAt", "hiddenAt");

ALTER TABLE "AdminDashboardActivityDismissal"
    ADD CONSTRAINT "AdminDashboardActivityDismissal_auditLogId_fkey"
    FOREIGN KEY ("auditLogId") REFERENCES "AuditLog"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminDashboardActivityDismissal"
    ADD CONSTRAINT "AdminDashboardActivityDismissal_hiddenById_fkey"
    FOREIGN KEY ("hiddenById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminDashboardActivityDismissal"
    ADD CONSTRAINT "AdminDashboardActivityDismissal_restoredById_fkey"
    FOREIGN KEY ("restoredById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
