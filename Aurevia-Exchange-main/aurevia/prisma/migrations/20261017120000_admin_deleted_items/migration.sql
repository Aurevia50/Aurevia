ALTER TABLE "WaitlistEntry"
    ADD COLUMN "deletedAt" TIMESTAMP(3),
    ADD COLUMN "deletedById" TEXT;

ALTER TABLE "ClientStory"
    ADD COLUMN "deletedAt" TIMESTAMP(3),
    ADD COLUMN "deletedById" TEXT;

ALTER TABLE "Broadcast"
    ADD COLUMN "deletedAt" TIMESTAMP(3),
    ADD COLUMN "deletedById" TEXT;

CREATE INDEX "WaitlistEntry_deletedAt_createdAt_idx"
    ON "WaitlistEntry"("deletedAt", "createdAt");

CREATE INDEX "ClientStory_deletedAt_createdAt_idx"
    ON "ClientStory"("deletedAt", "createdAt");

CREATE INDEX "Broadcast_deletedAt_createdAt_idx"
    ON "Broadcast"("deletedAt", "createdAt");

ALTER TABLE "WaitlistEntry"
    ADD CONSTRAINT "WaitlistEntry_deletedById_fkey"
    FOREIGN KEY ("deletedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientStory"
    ADD CONSTRAINT "ClientStory_deletedById_fkey"
    FOREIGN KEY ("deletedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Broadcast"
    ADD CONSTRAINT "Broadcast_deletedById_fkey"
    FOREIGN KEY ("deletedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
