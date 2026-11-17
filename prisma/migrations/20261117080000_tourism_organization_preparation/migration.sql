-- Additive preparation only. Existing rows remain unassigned and readable by
-- the legacy application; this does not enable multiagency access.
ALTER TABLE "Trip" ADD COLUMN "organizationId" TEXT REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD COLUMN "organizationId" TEXT REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD COLUMN "organizationId" TEXT REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Trip_organizationId_idx" ON "Trip"("organizationId");
CREATE INDEX "Lead_organizationId_idx" ON "Lead"("organizationId");
CREATE INDEX "Reservation_organizationId_idx" ON "Reservation"("organizationId");
