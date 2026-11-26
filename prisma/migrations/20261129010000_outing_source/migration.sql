-- Origem explícita da saída (SITE | SHEET | TEAM), em vez de inferir pelo
-- texto de "notes" (que a equipe pode editar).
-- Aditivo: uma coluna anulável e um UPDATE que só preenche essa coluna.
-- Nenhum outro valor muda e nenhuma linha é apagada.
-- Classificação dos registros existentes:
-- - SITE: notas que COMEÇAM (comparação exata, sensível a maiúsculas) com um
--   dos três textos que a sincronização com o site grava. É exatamente a
--   regra que o código anterior aplicava (SITE_CREATED_NOTE), então nenhuma
--   saída muda de situação nem de totais com a migração.
-- - Demais: ficam NULL = registro anterior lançado pela equipe ou importado
--   da planilha (não há marca confiável para separar os dois); o código os
--   trata como manuais, igual antes.
-- Retorno: o código anterior ignora a coluna e volta a inferir pela nota;
-- não é preciso removê-la. Se quiser removê-la:
--   ALTER TABLE "DestinationOuting" DROP COLUMN "source";
ALTER TABLE "DestinationOuting" ADD COLUMN "source" TEXT;
UPDATE "DestinationOuting" SET "source" = 'SITE'
WHERE "notes" IS NOT NULL AND (
  substr("notes", 1, length('Registrada a partir do mapa do site.')) = 'Registrada a partir do mapa do site.'
  OR substr("notes", 1, length('Visita registrada no mapa do site, sem data.')) = 'Visita registrada no mapa do site, sem data.'
  OR substr("notes", 1, length('Registrada a partir da viagem do site.')) = 'Registrada a partir da viagem do site.'
);
