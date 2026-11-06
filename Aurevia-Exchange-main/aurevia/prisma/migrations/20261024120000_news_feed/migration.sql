-- CreateEnum
CREATE TYPE "NewsFeedProviderType" AS ENUM ('RSS', 'GNEWS', 'ATOM');

-- CreateEnum
CREATE TYPE "NewsFeedCategory" AS ENUM ('ECONOMIC_NEWS', 'MARKET_NEWS', 'GENERAL', 'VIDEO');

-- CreateEnum
CREATE TYPE "NewsFeedItemStatus" AS ENUM ('ACTIVE', 'HIDDEN', 'DELETED_REMOTE');

-- CreateTable
CREATE TABLE "NewsFeedSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "providerType" "NewsFeedProviderType" NOT NULL,
    "category" "NewsFeedCategory" NOT NULL DEFAULT 'ECONOMIC_NEWS',
    "feedUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pollIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "configJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsFeedSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsFeedItem" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "author" TEXT,
    "publisher" TEXT,
    "category" "NewsFeedCategory" NOT NULL DEFAULT 'ECONOMIC_NEWS',
    "contentType" TEXT NOT NULL DEFAULT 'article',
    "publishedAt" TIMESTAMP(3),
    "thumbnailUrl" TEXT,
    "status" "NewsFeedItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsFeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsFeedSource_key_key" ON "NewsFeedSource"("key");

-- CreateIndex
CREATE INDEX "NewsFeedSource_enabled_providerType_idx" ON "NewsFeedSource"("enabled", "providerType");

-- CreateIndex
CREATE INDEX "NewsFeedItem_status_publishedAt_idx" ON "NewsFeedItem"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "NewsFeedItem_category_publishedAt_idx" ON "NewsFeedItem"("category", "publishedAt");

-- CreateIndex
CREATE INDEX "NewsFeedItem_publishedAt_idx" ON "NewsFeedItem"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsFeedItem_sourceId_externalId_key" ON "NewsFeedItem"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsFeedItem_sourceId_canonicalUrl_key" ON "NewsFeedItem"("sourceId", "canonicalUrl");

-- AddForeignKey
ALTER TABLE "NewsFeedItem" ADD CONSTRAINT "NewsFeedItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsFeedSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
