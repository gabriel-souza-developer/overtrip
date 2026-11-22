ALTER TABLE "User" ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PasswordResetToken" ADD COLUMN "issuedCredentialVersion" INTEGER NOT NULL DEFAULT 0;
-- Links antigos não possuem versão de credencial confiável.
UPDATE "PasswordResetToken" SET "usedAt" = CURRENT_TIMESTAMP WHERE "usedAt" IS NULL;
