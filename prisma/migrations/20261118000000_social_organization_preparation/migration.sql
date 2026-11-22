-- Additive preparation only. Existing rows remain unassigned and readable by
-- the legacy application; this does not enable multiagency access.
ALTER TABLE "SocialPost" ADD COLUMN "organizationId" TEXT REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SocialMedia" ADD COLUMN "organizationId" TEXT REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "SocialPost_organizationId_idx" ON "SocialPost"("organizationId");
CREATE INDEX "SocialMedia_organizationId_idx" ON "SocialMedia"("organizationId");
