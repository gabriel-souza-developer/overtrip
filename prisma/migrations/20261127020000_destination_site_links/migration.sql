-- Vincula viagens e visitas (registros do site) a um destino do banco privado.
-- Aditivo: só colunas novas e anuláveis, sem recriar tabelas; registros
-- existentes ficam com NULL (sem vínculo).
-- Retorno: DROP INDEX "Trip_destinationId_idx"; DROP INDEX "Visit_destinationId_idx";
--          ALTER TABLE "Trip" DROP COLUMN "destinationId"; ALTER TABLE "Visit" DROP COLUMN "destinationId";
ALTER TABLE "Trip" ADD COLUMN "destinationId" TEXT REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD COLUMN "destinationId" TEXT REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Trip_destinationId_idx" ON "Trip"("destinationId");
CREATE INDEX "Visit_destinationId_idx" ON "Visit"("destinationId");
