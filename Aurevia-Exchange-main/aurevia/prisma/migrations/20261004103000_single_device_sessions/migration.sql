ALTER TABLE "User"
ADD COLUMN "activeSessionId" TEXT,
ADD COLUMN "activeSessionUpdatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_activeSessionId_key" ON "User"("activeSessionId");