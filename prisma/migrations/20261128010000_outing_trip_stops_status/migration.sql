-- Viagem com vários destinos e situação da saída (planejada, realizada, cancelada).
-- Aditivo: duas colunas anuláveis e um índice, sem recriar tabela nem mudar
-- valores. Registros existentes ficam com NULL nas duas colunas
-- (parentOutingId NULL = saída independente; status NULL = sem confirmação,
-- interpretado pelo código em effectiveOutingStatus).
-- Retorno: as paradas não guardam valores (ficam só na principal), então
-- remover as colunas devolve as paradas como saídas soltas sem valores e não
-- duplica totais; status gravados se perdem (voltam à regra pela data).
-- Para retornar ao código anterior não é preciso remover as colunas (o
-- código antigo as ignora). Se quiser removê-las:
--   DROP INDEX "DestinationOuting_parentOutingId_idx";
--   ALTER TABLE "DestinationOuting" DROP COLUMN "parentOutingId";
--   ALTER TABLE "DestinationOuting" DROP COLUMN "status";
ALTER TABLE "DestinationOuting" ADD COLUMN "status" TEXT;
ALTER TABLE "DestinationOuting" ADD COLUMN "parentOutingId" TEXT REFERENCES "DestinationOuting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DestinationOuting_parentOutingId_idx" ON "DestinationOuting"("parentOutingId");
