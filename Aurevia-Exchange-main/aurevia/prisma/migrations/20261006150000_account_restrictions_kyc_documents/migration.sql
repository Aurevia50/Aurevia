CREATE TYPE "DocumentStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED');

ALTER TABLE "User"
ADD COLUMN "withdrawalEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "accountRestricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "restrictionReason" TEXT;

CREATE TABLE "KycDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'SUBMITTED',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KycDocument_storageKey_key" ON "KycDocument"("storageKey");
CREATE INDEX "KycDocument_userId_status_uploadedAt_idx" ON "KycDocument"("userId", "status", "uploadedAt");

ALTER TABLE "KycDocument"
ADD CONSTRAINT "KycDocument_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KycDocument" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE "KycDocument" FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON TABLE "KycDocument" FROM authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT ALL ON TABLE "KycDocument" TO service_role';
    END IF;
END $$;