ALTER TABLE "ClientStory"
  ALTER COLUMN "country" DROP NOT NULL,
  ADD COLUMN "title" TEXT,
  ADD COLUMN "rating" SMALLINT;

ALTER TABLE "ClientStory"
  ADD CONSTRAINT "ClientStory_rating_range_check"
  CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5));
