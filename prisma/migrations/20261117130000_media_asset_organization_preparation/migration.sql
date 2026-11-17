-- Additive preparation only. Existing rows remain unassigned and readable by
-- the legacy application; this does not enable multiagency uploads.
ALTER TABLE "MediaAsset" ADD COLUMN "organizationId" TEXT REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "MediaAsset_organizationId_idx" ON "MediaAsset"("organizationId");
