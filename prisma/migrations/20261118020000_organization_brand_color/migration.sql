-- Additive only. Nullable, no backfill: existing organizations keep the
-- fixed green fallback palette until an OWNER/ADMIN sets a brand color
-- through the organization panel.
ALTER TABLE "Organization" ADD COLUMN "brandColor" TEXT;
