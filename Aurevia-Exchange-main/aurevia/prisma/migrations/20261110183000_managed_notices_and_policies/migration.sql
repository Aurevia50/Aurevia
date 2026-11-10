CREATE TYPE "ManagedNoticeType" AS ENUM ('ANNOUNCEMENT', 'TERMS', 'PRIVACY');
CREATE TYPE "NoticeVisibility" AS ENUM ('ADMIN_ONLY', 'HIDDEN', 'USERS', 'MANDATORY_ACCEPTANCE', 'SYSTEM_CRITICAL');
CREATE TYPE "ManagedNoticeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

CREATE TABLE "ManagedNotice" (
    "id" TEXT NOT NULL,
    "type" "ManagedNoticeType" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "content" TEXT NOT NULL,
    "version" VARCHAR(64),
    "visibility" "NoticeVisibility" NOT NULL DEFAULT 'HIDDEN',
    "status" "ManagedNoticeStatus" NOT NULL DEFAULT 'DRAFT',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "unpublishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedNotice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagedNotice_type_version_key" ON "ManagedNotice"("type", "version");
CREATE INDEX "ManagedNotice_type_status_enabled_visibility_idx" ON "ManagedNotice"("type", "status", "enabled", "visibility");
CREATE INDEX "ManagedNotice_startsAt_endsAt_idx" ON "ManagedNotice"("startsAt", "endsAt");

ALTER TABLE "ManagedNotice" ADD CONSTRAINT "ManagedNotice_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManagedNotice" ADD CONSTRAINT "ManagedNotice_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
