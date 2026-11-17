-- Additive preparation only. Existing rows remain unassigned and readable by
-- the legacy application; this does not enable multiagency access.
ALTER TABLE "Visit" ADD COLUMN "organizationId" TEXT REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GalleryEntry" ADD COLUMN "organizationId" TEXT REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Visit_organizationId_idx" ON "Visit"("organizationId");
CREATE INDEX "GalleryEntry_organizationId_idx" ON "GalleryEntry"("organizationId");
