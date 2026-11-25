-- Additive only. Nullable, no backfill: existing organizations simply have
-- no override until an OWNER/ADMIN sets one through the organization panel.
ALTER TABLE "Organization" ADD COLUMN "defaultPriceUnit" TEXT;
