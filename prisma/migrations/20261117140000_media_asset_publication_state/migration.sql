-- Additive preparation. Every existing row already finished writing its
-- files successfully before gaining a MediaAsset row (the only flow that
-- existed until now creates the row after the write completes), so marking
-- all of them as published from their own createdAt preserves current public
-- behavior exactly; only new rows created after this migration can be
-- genuinely pending.
ALTER TABLE "MediaAsset" ADD COLUMN "publishedAt" DATETIME;
UPDATE "MediaAsset" SET "publishedAt" = "createdAt" WHERE "publishedAt" IS NULL;
