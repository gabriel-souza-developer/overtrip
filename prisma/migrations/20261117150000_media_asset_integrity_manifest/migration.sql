-- Additive preparation. Existing rows (all already published, per the
-- previous migration's backfill) keep fileIntegrity NULL: they predate this
-- column and their files were already trusted/served before this change, so
-- nothing about their current public visibility changes. Only new pending
-- rows created after this migration carry a real integrity manifest, and
-- reconcilePendingMedia treats a NULL manifest as "not verifiable" rather
-- than as proof of completion.
ALTER TABLE "MediaAsset" ADD COLUMN "fileIntegrity" TEXT;
