CREATE TYPE "SupportCategory" AS ENUM ('GENERAL', 'FUNDING', 'WITHDRAWAL', 'ACCOUNT', 'SECURITY', 'COMPLAINT');

ALTER TABLE "User"
ADD COLUMN "avatarKey" TEXT;

ALTER TABLE "FundingRequest"
ADD COLUMN "receiptKey" TEXT;

ALTER TABLE "SupportConversation"
ADD COLUMN "category" "SupportCategory" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN "isComplaint" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "attachmentKey" TEXT;

CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key"
ON "PasswordResetToken"("tokenHash");

CREATE INDEX "PasswordResetToken_userId_createdAt_idx"
ON "PasswordResetToken"("userId", "createdAt");

CREATE INDEX "PasswordResetToken_expiresAt_idx"
ON "PasswordResetToken"("expiresAt");

ALTER TABLE "PasswordResetToken"
ADD CONSTRAINT "PasswordResetToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;