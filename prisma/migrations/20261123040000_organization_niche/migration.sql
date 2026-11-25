-- Additive only. Existing organizations (all from the turismo/multiagência
-- line, already in production) get the "turismo" default; pousada and
-- restaurante organizations are created afterwards with an explicit niche.
ALTER TABLE "Organization" ADD COLUMN "niche" TEXT NOT NULL DEFAULT 'turismo';
