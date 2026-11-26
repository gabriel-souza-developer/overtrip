/**
 * Junta numa só viagem as saídas de vários destinos do mesmo dia (correção
 * confirmada pela equipe), sem apagar registros nem mudar valores.
 *
 *   npx tsx scripts/group-destination-trip.ts                # só simula (15/08/2026, Cabedelo)
 *   npx tsx scripts/group-destination-trip.ts --apply        # grava
 *   npx tsx scripts/group-destination-trip.ts --day 2026-08-15 --names "Dique de Cabedelo;Fortaleza de Santa Catarina;Praia Formosa"
 *
 * - Usa o DATABASE_URL do ambiente. Na produção, só com autorização, migração
 *   20261128010000_outing_trip_stops_status aplicada e backup (ver
 *   deploy/ORACLE_STATUS.md).
 * - Idempotente: o que já está agrupado é mantido.
 * - NÃO marca a viagem como realizada: a situação continua como estava
 *   (registros criados pelo site seguem "a confirmar" até a equipe confirmar).
 * - Qualquer ambiguidade (destino não encontrado, duas saídas no dia, valores
 *   diferentes entre as saídas) aborta sem gravar. O relatório não mostra
 *   valores, só destinos e contagens.
 */
import { PrismaClient } from '@prisma/client';
import { groupOutingsAsTrip } from '../src/services/destinationTrips.js';

const DEFAULT_DAY = '2026-08-15';
const DEFAULT_NAMES = ['Dique de Cabedelo', 'Fortaleza de Santa Catarina', 'Praia Formosa'];

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const day = arg('--day') ?? DEFAULT_DAY;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Use --day AAAA-MM-DD.');
  const names = (arg('--names')?.split(';') ?? DEFAULT_NAMES).map((name) => name.trim()).filter(Boolean);
  if (names.length < 2) throw new Error('Informe ao menos dois destinos em --names, separados por ";".');
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const plan = await prisma.$transaction((tx) => groupOutingsAsTrip(tx, day, names, apply), { timeout: 30000 });
    console.log(`Dia ${plan.day}. Saída principal: ${plan.primary?.destination ?? 'nenhuma'}.`);
    console.log(`Ligar como parada: ${plan.link.map((item) => item.destination).join(', ') || 'nenhuma'}.`);
    console.log(`Criar parada (destino sem saída no dia): ${plan.create.join(', ') || 'nenhuma'}.`);
    console.log(`Já agrupadas: ${plan.alreadyGrouped.join(', ') || 'nenhuma'}.`);
    if (plan.problems.length) {
      for (const problem of plan.problems) console.log(`Problema: ${problem}`);
      console.log('Nada foi gravado.');
      process.exitCode = 2;
      return;
    }
    console.log(apply ? 'Gravado.' : 'Simulação: nada foi gravado. Use --apply para gravar.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
