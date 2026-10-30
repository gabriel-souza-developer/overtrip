-- Add normalized search columns for case/accent-insensitive search
-- Trip model
ALTER TABLE "Trip" ADD COLUMN "titleSearch" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Trip" ADD COLUMN "citySearch" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Trip" ADD COLUMN "categorySearch" TEXT NOT NULL DEFAULT '';

-- Visit model
ALTER TABLE "Visit" ADD COLUMN "titleSearch" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Visit" ADD COLUMN "citySearch" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Visit" ADD COLUMN "regionSearch" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Visit" ADD COLUMN "sourceSearch" TEXT NOT NULL DEFAULT '';

-- GalleryEntry model
ALTER TABLE "GalleryEntry" ADD COLUMN "titleSearch" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GalleryEntry" ADD COLUMN "descriptionSearch" TEXT NOT NULL DEFAULT '';

-- Create indexes for search performance
CREATE INDEX "Trip_titleSearch_idx" ON "Trip"("titleSearch");
CREATE INDEX "Trip_citySearch_idx" ON "Trip"("citySearch");
CREATE INDEX "Trip_categorySearch_idx" ON "Trip"("categorySearch");

CREATE INDEX "Visit_titleSearch_idx" ON "Visit"("titleSearch");
CREATE INDEX "Visit_citySearch_idx" ON "Visit"("citySearch");
CREATE INDEX "Visit_regionSearch_idx" ON "Visit"("regionSearch");
CREATE INDEX "Visit_sourceSearch_idx" ON "Visit"("sourceSearch");

CREATE INDEX "GalleryEntry_titleSearch_idx" ON "GalleryEntry"("titleSearch");
CREATE INDEX "GalleryEntry_descriptionSearch_idx" ON "GalleryEntry"("descriptionSearch");