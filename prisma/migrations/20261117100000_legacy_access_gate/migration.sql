-- A migração preserva acesso somente às contas já existentes. Contas criadas
-- depois recebem false por padrão, independentemente de seu papel global.
ALTER TABLE "User" ADD COLUMN "legacyAccess" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "legacyAccess" = true;
