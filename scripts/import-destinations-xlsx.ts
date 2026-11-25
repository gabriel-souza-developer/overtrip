/**
 * Importa a aba "DESTINOS VISITADOS" da planilha antiga da empresa para o
 * banco privado de destinos do painel OVERTRIP.
 *
 *   npx tsx scripts/import-destinations-xlsx.ts --file "caminho/planilha.xlsx"          # só simula
 *   npx tsx scripts/import-destinations-xlsx.ts --file "caminho/planilha.xlsx" --apply  # grava
 *
 * - Usa o DATABASE_URL do ambiente. Na produção, só com autorização e
 *   backup do banco (ver deploy/ORACLE_STATUS.md).
 * - Idempotente: um destino já importado (mesmo importKey) é mantido como
 *   está — nunca sobrescreve edições feitas no painel.
 * - O relatório mostra só contagens e números de linha: nunca nomes de
 *   fornecedores, valores ou notas.
 * - Com --apply, depois de gravar, vincula as viagens e visitas do site aos
 *   destinos (mesma ação do botão "Sincronizar com o site").
 * - A planilha contém dados internos (fornecedores e resultado financeiro):
 *   não a adicione ao repositório.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { readXlsxSheets } from '../src/lib/xlsxReader.js';
import { applySheetCorrections, mapDestinationSheet } from '../src/services/destinationSheetImport.js';
import { syncDestinationsWithSite } from '../src/services/destinationSiteSync.js';
import { legacyTourismOrganizationIdForNewRecord } from '../src/services/legacyTourismScope.js';
import { normalizeForSearch } from '../src/utils/searchUtils.js';

const SHEET_NAME = 'DESTINOS VISITADOS';

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const file = arg('--file');
  const apply = process.argv.includes('--apply');
  if (!file) throw new Error('Informe --file "caminho/planilha.xlsx".');
  const sheets = readXlsxSheets(readFileSync(file));
  const rows = sheets.get(SHEET_NAME);
  if (!rows) throw new Error(`Aba "${SHEET_NAME}" não encontrada. Abas: ${[...sheets.keys()].join(', ')}`);
  const { destinations, skippedRows } = mapDestinationSheet(rows);
  for (const line of applySheetCorrections(destinations)) console.log(`Correção: ${line}`);
  const outings = destinations.reduce((sum, destination) => sum + destination.outings.length, 0);

  console.log(`Planilha: ${destinations.length} destinos (${destinations.filter((d) => d.outings.length).length} com saídas registradas, ${outings} saídas no total).`);
  console.log(`Linhas ignoradas por não terem nome de destino: ${skippedRows.length ? skippedRows.join(', ') : 'nenhuma'}.`);

  const prisma = new PrismaClient();
  try {
    const existing = new Set((await prisma.destination.findMany({
      where: { importKey: { in: destinations.map((destination) => destination.importKey) } },
      select: { importKey: true },
    })).map((row) => row.importKey));
    const pending = destinations.filter((destination) => !existing.has(destination.importKey));
    console.log(`Já importados antes (mantidos sem alteração): ${existing.size}. A criar: ${pending.length}.`);
    if (!apply) { console.log('Simulação: nada foi gravado. Use --apply para gravar.'); return; }

    const organizationId = legacyTourismOrganizationIdForNewRecord();
    await prisma.$transaction(async (tx) => {
      for (const { outings: items, links, ...destination } of pending) {
        await tx.destination.create({
          data: {
            ...destination,
            status: 'IDEA',
            links: JSON.stringify(links),
            organizationId,
            nameSearch: normalizeForSearch(destination.name),
            citySearch: normalizeForSearch(destination.city ?? ''),
            outings: { create: items.map(({ date, ...outing }) => ({ ...outing, date: date ? new Date(`${date}T12:00:00.000Z`) : null })) },
          },
        });
      }
    });
    console.log(`Gravados ${pending.length} destinos.`);
    // Em seguida liga viagens e visitas do site aos destinos (idempotente).
    const report = await prisma.$transaction((tx) => syncDestinationsWithSite(tx));
    console.log(`Site: ${report.linkedVisits} visitas e ${report.linkedTrips} viagens vinculadas, ${report.createdDestinations} destinos criados a partir do site, ${report.createdOutings} saídas criadas, ${report.filledFields} campos completados.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
