-- Lugares não pagantes por saída (cortesias). Aditivo: coluna opcional; NULL = nenhuma.
-- Retorno: ALTER TABLE "DestinationOuting" DROP COLUMN "courtesySeats";
ALTER TABLE "DestinationOuting" ADD COLUMN "courtesySeats" INTEGER;
