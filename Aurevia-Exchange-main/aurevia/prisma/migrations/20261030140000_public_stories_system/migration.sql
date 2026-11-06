CREATE TYPE "StoryStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "StoryVisibility" AS ENUM ('PUBLIC', 'REGISTERED_USERS');
CREATE TYPE "StoryMediaType" AS ENUM ('IMAGE', 'VIDEO');
CREATE TYPE "StoryEngagementType" AS ENUM ('VIEW', 'LINK_CLICK');

CREATE TABLE "StoryCategory" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(3000) NOT NULL,
    "categoryId" TEXT NOT NULL,
    "externalUrl" VARCHAR(2048),
    "status" "StoryStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "StoryVisibility" NOT NULL DEFAULT 'PUBLIC',
    "publishAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoryMedia" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "type" "StoryMediaType" NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "storageKey" VARCHAR(255) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "altText" VARCHAR(300),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoryEngagement" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "viewerKey" VARCHAR(64) NOT NULL,
    "type" "StoryEngagementType" NOT NULL,
    "day" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryEngagement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoryCategory_name_key" ON "StoryCategory"("name");
CREATE UNIQUE INDEX "StoryCategory_slug_key" ON "StoryCategory"("slug");
CREATE INDEX "StoryCategory_displayOrder_name_idx" ON "StoryCategory"("displayOrder", "name");
CREATE INDEX "Story_status_publishAt_expiresAt_idx" ON "Story"("status", "publishAt", "expiresAt");
CREATE INDEX "Story_visibility_status_publishAt_displayOrder_idx" ON "Story"("visibility", "status", "publishAt", "displayOrder");
CREATE INDEX "Story_deletedAt_createdAt_idx" ON "Story"("deletedAt", "createdAt");
CREATE INDEX "Story_categoryId_displayOrder_idx" ON "Story"("categoryId", "displayOrder");
CREATE UNIQUE INDEX "StoryMedia_storyId_storageKey_key" ON "StoryMedia"("storyId", "storageKey");
CREATE INDEX "StoryMedia_storyId_displayOrder_idx" ON "StoryMedia"("storyId", "displayOrder");
CREATE UNIQUE INDEX "StoryEngagement_storyId_viewerKey_type_day_key" ON "StoryEngagement"("storyId", "viewerKey", "type", "day");
CREATE INDEX "StoryEngagement_storyId_type_createdAt_idx" ON "StoryEngagement"("storyId", "type", "createdAt");

ALTER TABLE "Story" ADD CONSTRAINT "Story_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StoryCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Story" ADD CONSTRAINT "Story_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Story" ADD CONSTRAINT "Story_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoryMedia" ADD CONSTRAINT "StoryMedia_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoryEngagement" ADD CONSTRAINT "StoryEngagement_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "StoryCategory" ("id", "name", "slug", "displayOrder") VALUES
('story-category-company-updates', 'Company Updates', 'company-updates', 1),
('story-category-market-news', 'Market News', 'market-news', 2),
('story-category-announcements', 'Announcements', 'announcements', 3),
('story-category-platform-features', 'Platform Features', 'platform-features', 4),
('story-category-promotions', 'Promotions', 'promotions', 5),
('story-category-educational-content', 'Educational Content', 'educational-content', 6),
('story-category-community-updates', 'Community Updates', 'community-updates', 7);

INSERT INTO storage.buckets (id, name, public, file_size_limit, owner, owner_id, created_at, updated_at, avif_autodetection)
VALUES ('stories', 'stories', false, 52428800, NULL, NULL, NOW(), NOW(), false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM storage.buckets
        WHERE id = 'stories'
          AND public IS FALSE
          AND (file_size_limit IS NULL OR file_size_limit >= 52428800)
    ) THEN
        RAISE EXCEPTION 'The stories Storage bucket must be private and allow uploads up to 50 MB.';
    END IF;
END $$;

CREATE POLICY aurevia_stories_block_client_access
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (bucket_id <> 'stories')
WITH CHECK (bucket_id <> 'stories');
