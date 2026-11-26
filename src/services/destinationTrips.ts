import type { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';
import { TRIP_LEVEL_FIELDS, conflictingTripFields, outingDay } from './destinationBank.js';
import { destinationMatchKey } from './destinationNames.js';
import { currentLegacyDestinationFilter } from './legacyTourismScope.js';

// Viagem com vários destinos no banco privado: uma saída PRINCIPAL guarda
// situação e valores; saídas de outros destinos viram PARADAS dela
// (parentOutingId). Invariante: parada não guarda situação nem valores, então
// separar nunca duplica totais. Ligar nunca apaga um valor que só a parada
// tinha: diferenças bloqueiam a junção.

type Tx = Prisma.TransactionClient;

export const FIELD_LABELS: Record<string, string> = {
  status: 'situação', passengers: 'passageiros', courtesySeats: 'cortesias', pricePerPersonCents: 'valor por pessoa',
  transportCostCents: 'transporte', extraCostCents: 'taxas extras', supplier: 'transporte contratado',
};
export const MERGED_NOTE = 'Juntada a uma viagem com vários destinos: valores iguais aos da saída principal ficaram só nela.';
const tripFieldsSelect = { id: true, destinationId: true, date: true, status: true, passengers: true, courtesySeats: true, pricePerPersonCents: true, transportCostCents: true, extraCostCents: true, supplier: true, notes: true, parentOutingId: true } as const;
const clearedTripFields = Object.fromEntries(TRIP_LEVEL_FIELDS.map((field) => [field, null])) as Record<typeof TRIP_LEVEL_FIELDS[number], null>;
const inLegacyScope = () => ({ destination: { is: currentLegacyDestinationFilter() } });

export async function findPrimary(tx: Tx, outingId: string, destinationId?: string) {
  const primary = await tx.destinationOuting.findFirst({
    where: { id: outingId, ...(destinationId ? { destinationId } : {}), ...inLegacyScope() },
    select: { ...tripFieldsSelect, stops: { select: { id: true, destinationId: true } } },
  });
  if (!primary) throw AppError.notFound('Saída não encontrada');
  if (primary.parentOutingId) throw AppError.badRequest('Esta saída já é uma parada de outra viagem. Use a saída principal.');
  return primary;
}
type Primary = Awaited<ReturnType<typeof findPrimary>>;

/** Depois da escrita (o SQLite já segura o bloqueio): confere que nada simultâneo quebrou a viagem. */
async function assertTripConsistent(tx: Tx, primary: Primary) {
  const after = await tx.destinationOuting.findFirst({ where: { id: primary.id, parentOutingId: null }, select: { stops: { select: { destinationId: true } } } });
  if (!after) throw AppError.conflict('A saída principal mudou enquanto você juntava. Recarregue e tente de novo.');
  const ids = after.stops.map((stop) => stop.destinationId);
  if (new Set(ids).size !== ids.length || ids.includes(primary.destinationId)) throw AppError.conflict('Esse destino já faz parte desta viagem.');
}

const tripDestinations = (primary: Primary) => new Set([primary.destinationId, ...primary.stops.map((stop) => stop.destinationId)]);

/** Liga uma saída existente (de outro destino) como parada. Devolve o destino da parada. */
export async function linkOutingAsStop(tx: Tx, primary: Primary, stopOutingId: string) {
  const stop = await tx.destinationOuting.findFirst({
    where: { id: stopOutingId, ...inLegacyScope() },
    select: { ...tripFieldsSelect, destination: { select: { updatedAt: true } }, _count: { select: { stops: true } } },
  });
  if (!stop) throw AppError.notFound('Saída a ligar não encontrada');
  if (stop.id === primary.id) throw AppError.badRequest('Escolha a saída de outro destino.');
  if (stop.parentOutingId) throw AppError.conflict('Essa saída já faz parte de outra viagem. Separe-a antes.');
  if (stop._count.stops) throw AppError.conflict('Essa saída já é a principal de outra viagem.');
  if (tripDestinations(primary).has(stop.destinationId)) throw AppError.conflict('Esse destino já faz parte desta viagem.');
  const conflicts = conflictingTripFields(primary, stop);
  if (conflicts.length) {
    throw AppError.conflict(`A saída a ligar tem dados próprios diferentes da principal (${conflicts.map((field) => FIELD_LABELS[field]).join(', ')}). Corrija a saída principal ou deixe esses campos em branco na outra antes de juntar, para nada sumir do financeiro.`);
  }
  // Só sobram valores IGUAIS aos da principal: ficam só nela (nada se perde).
  const hadValues = TRIP_LEVEL_FIELDS.some((field) => stop[field] != null);
  const notes = hadValues ? [stop.notes, MERGED_NOTE].filter(Boolean).join(' ').slice(0, 2000) : stop.notes;
  // Condições no próprio UPDATE: continua solta e sem paradas próprias.
  const { count } = await tx.destinationOuting.updateMany({
    where: { id: stop.id, parentOutingId: null, stops: { none: {} } },
    data: { parentOutingId: primary.id, ...clearedTripFields, notes },
  });
  if (count !== 1) throw AppError.conflict('Essa saída mudou enquanto você juntava. Recarregue e tente de novo.');
  await assertTripConsistent(tx, primary);
  return { destinationId: stop.destinationId, previousUpdatedAt: stop.destination.updatedAt };
}

/** Acrescenta um destino sem saída própria: cria a parada, sem valores, no dia da principal. */
export async function addDestinationAsStop(tx: Tx, primary: Primary, destinationId: string) {
  const target = await tx.destination.findFirst({ where: { id: destinationId, ...currentLegacyDestinationFilter() }, select: { id: true, updatedAt: true } });
  if (!target) throw AppError.notFound('Destino a ligar não encontrado');
  if (tripDestinations(primary).has(target.id)) throw AppError.conflict('Esse destino já faz parte desta viagem.');
  await tx.destinationOuting.create({ data: { destinationId: target.id, date: primary.date, parentOutingId: primary.id, source: 'TEAM' } });
  await assertTripConsistent(tx, primary);
  return { destinationId: target.id, previousUpdatedAt: target.updatedAt };
}

/** Separa a parada: volta a ser saída independente, sem valores, com a situação gravada da principal. */
export async function detachStop(tx: Tx, primary: Primary, stopId: string) {
  const stop = await tx.destinationOuting.findFirst({
    where: { id: stopId, parentOutingId: primary.id, ...inLegacyScope() },
    select: { destination: { select: { id: true, updatedAt: true } } },
  });
  if (!stop) throw AppError.notFound('Parada não encontrada nesta viagem');
  const { count } = await tx.destinationOuting.updateMany({ where: { id: stopId, parentOutingId: primary.id }, data: { parentOutingId: null, status: primary.status } });
  if (count !== 1) throw AppError.notFound('Parada não encontrada nesta viagem');
  return { destinationId: stop.destination.id, previousUpdatedAt: stop.destination.updatedAt };
}

// ── Agrupar pontos do mesmo dia numa viagem (correção confirmada pela equipe) ──

export interface GroupPlan {
  day: string;
  primary: { destination: string; outingId: string } | null;
  link: Array<{ destination: string; outingId: string }>;
  create: string[]; // destinos sem saída no dia: ganham parada sem valores
  alreadyGrouped: string[];
  problems: string[];
}

/**
 * Planeja (e, com apply, executa) juntar as saídas de `names` no dia `day`
 * numa só viagem. Nunca muda situação nem valores da principal; a principal
 * é a saída com mais dados de viagem preenchidos (empate: ordem de `names`).
 * Qualquer ambiguidade vira problema e nada é gravado.
 */
export async function groupOutingsAsTrip(tx: Tx, day: string, names: string[], apply: boolean): Promise<GroupPlan> {
  const plan: GroupPlan = { day, primary: null, link: [], create: [], alreadyGrouped: [], problems: [] };
  const all = await tx.destination.findMany({ where: currentLegacyDestinationFilter(), select: { id: true, name: true } });
  const found: Array<{ id: string; name: string }> = [];
  for (const name of names) {
    const matches = all.filter((row) => destinationMatchKey(row.name) === destinationMatchKey(name));
    if (matches.length !== 1) { plan.problems.push(`${name}: ${matches.length === 0 ? 'destino não encontrado' : `${matches.length} destinos com esse nome`}.`); continue; }
    found.push(matches[0]);
  }
  if (plan.problems.length) return plan;

  const outings = await tx.destinationOuting.findMany({
    where: { destinationId: { in: found.map((row) => row.id) } },
    select: { ...tripFieldsSelect, _count: { select: { stops: true } } },
  });
  const onDay = new Map(found.map((row) => [row.id, outings.filter((outing) => outing.destinationId === row.id && outing.date !== null && outingDay(outing.date) === day)]));
  for (const row of found) if (onDay.get(row.id)!.length > 1) plan.problems.push(`${row.name}: mais de uma saída em ${day}.`);
  if (plan.problems.length) return plan;

  const filled = (outing: typeof outings[number]) => TRIP_LEVEL_FIELDS.filter((field) => outing[field] != null).length;
  const existing = found.flatMap((row) => onDay.get(row.id)!.map((outing) => ({ row, outing })));
  // Já agrupadas antes: a principal é a que tem paradas (ou a principal das paradas).
  const parentIds = new Set(existing.map(({ outing }) => outing.parentOutingId).filter((id): id is string => id !== null));
  const knownPrimary = existing.find(({ outing }) => outing._count.stops > 0 || parentIds.has(outing.id));
  if (parentIds.size > 1 || (knownPrimary && [...parentIds].some((id) => id !== knownPrimary.outing.id))) { plan.problems.push('As saídas já estão em viagens diferentes. Separe-as no painel antes.'); return plan; }
  const chosen = knownPrimary ?? [...existing].sort((a, b) => filled(b.outing) - filled(a.outing))[0];
  if (!chosen) { plan.problems.push(`Nenhuma saída registrada em ${day} para esses destinos.`); return plan; }
  if (chosen.outing.parentOutingId) { plan.problems.push(`${chosen.row.name}: a saída é parada de uma viagem fora desta lista.`); return plan; }
  plan.primary = { destination: chosen.row.name, outingId: chosen.outing.id };

  for (const row of found) {
    if (row.id === chosen.row.id) continue;
    const outing = onDay.get(row.id)![0];
    if (!outing) { plan.create.push(row.name); continue; }
    if (outing.parentOutingId === chosen.outing.id) { plan.alreadyGrouped.push(row.name); continue; }
    if (outing._count.stops) { plan.problems.push(`${row.name}: a saída já é principal de outra viagem.`); continue; }
    const conflicts = conflictingTripFields(chosen.outing, outing);
    if (conflicts.length) { plan.problems.push(`${row.name}: dados diferentes da principal (${conflicts.map((field) => FIELD_LABELS[field]).join(', ')}).`); continue; }
    plan.link.push({ destination: row.name, outingId: outing.id });
  }
  if (!apply || plan.problems.length) return plan;

  for (const item of plan.link) {
    await linkOutingAsStop(tx, await findPrimary(tx, chosen.outing.id), item.outingId);
  }
  for (const name of plan.create) {
    await addDestinationAsStop(tx, await findPrimary(tx, chosen.outing.id), found.find((row) => row.name === name)!.id);
  }
  return plan;
}
