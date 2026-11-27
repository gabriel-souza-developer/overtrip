import { Prisma } from '@prisma/client';
import { effectiveOutingStatus, isSiteCreatedOuting, outingSource, outingTotals, type EffectiveOutingStatus } from './destinationBank.js';

// Painel financeiro (somente leitura). Duas fontes, ambas lançadas à mão:
// 1. Saídas realizadas do banco de destinos (receita, despesa e resultado
//    calculados a partir de passageiros, valor por pessoa, transporte e taxas).
// 2. Reservas e parcelas (contratado, recebido, a receber, vencido).
// Nada aqui processa pagamento.

export interface FinanceOutingInput {
  id: string;
  destinationId: string;
  destinationName: string;
  date: Date | null;
  passengers: number | null;
  courtesySeats: number | null;
  pricePerPersonCents: number | null;
  transportCostCents: number | null;
  extraCostCents: number | null;
  /** Origem gravada (SITE | SHEET | TEAM); null = registro anterior da equipe/planilha. */
  source?: string | null;
  /** null/ausente = registro anterior ao campo (ver effectiveOutingStatus). */
  status?: string | null;
  /** Preenchido nas paradas de uma viagem: os valores ficam na principal. */
  parentOutingId?: string | null;
  /** Outros destinos da mesma viagem (paradas), quando esta é a principal. */
  stops?: Array<{ destinationId: string; destinationName: string }>;
}

export type MissingField = 'passengers' | 'pricePerPerson' | 'costs';

interface Totals {
  outings: number;
  completeOutings: number;
  passengers: number;
  courtesySeats: number;
  revenueCents: number;
  expenseCents: number;
  resultCents: number;
  marginPct: number | null;
  averageTicketCents: number | null;
  averageResultCents: number | null;
}

function emptyTotals(): Totals {
  return { outings: 0, completeOutings: 0, passengers: 0, courtesySeats: 0, revenueCents: 0, expenseCents: 0, resultCents: 0, marginPct: null, averageTicketCents: null, averageResultCents: null };
}

/**
 * Receita, despesa e resultado somam só as saídas com dados completos
 * (passageiros, valor por pessoa e algum custo), para a margem não comparar
 * receita de uma saída com custo de outra. Passageiros somam todas.
 */
function accumulate(totals: Totals, outing: FinanceOutingInput) {
  const { revenueCents, expenseCents, resultCents } = outingTotals(outing);
  totals.outings++;
  if (outing.passengers !== null) totals.passengers += outing.passengers;
  totals.courtesySeats += outing.courtesySeats ?? 0;
  if (revenueCents !== null && expenseCents !== null && resultCents !== null) {
    totals.completeOutings++;
    totals.revenueCents += revenueCents;
    totals.expenseCents += expenseCents;
    totals.resultCents += resultCents;
  }
}

function finish(totals: Totals): Totals {
  const complete = totals.completeOutings;
  return {
    ...totals,
    marginPct: totals.revenueCents > 0 ? Math.round((totals.resultCents / totals.revenueCents) * 1000) / 10 : null,
    averageTicketCents: complete ? Math.round(totals.revenueCents / complete) : null,
    averageResultCents: complete ? Math.round(totals.resultCents / complete) : null,
  };
}

const yearOf = (date: Date) => date.getUTCFullYear();

export function missingFields(outing: FinanceOutingInput): MissingField[] {
  const missing: MissingField[] = [];
  if (outing.passengers === null) missing.push('passengers');
  if (outing.pricePerPersonCents === null) missing.push('pricePerPerson');
  if (outing.transportCostCents === null && outing.extraCostCents === null) missing.push('costs');
  return missing;
}

/**
 * `year` null = todos os anos. Conta cada viagem uma vez: paradas de uma
 * viagem com vários destinos ficam de fora (os valores estão na principal).
 * Só entram saídas realizadas: canceladas, planejadas e as criadas pelo site
 * ainda a confirmar ficam de fora (ver effectiveOutingStatus). Sem data, só
 * no total geral.
 */
export function summarizeFinanceOutings(input: FinanceOutingInput[], year: number | null, now = new Date()) {
  const rows = input.filter((row) => !row.parentOutingId);
  const statusOf = new Map(rows.map((row) => [row.id, effectiveOutingStatus(row, now)]));
  const realized = rows.filter((row) => statusOf.get(row.id)!.status === 'REALIZED');
  const years = [...new Set(rows.filter((row) => ['REALIZED', 'UNCONFIRMED'].includes(statusOf.get(row.id)!.status)).flatMap((row) => (row.date ? [yearOf(row.date)] : [])))].sort((a, b) => a - b);
  const inPeriod = realized.filter((row) => (year === null ? true : row.date !== null && yearOf(row.date) === year));

  const totals = emptyTotals();
  for (const row of inPeriod) accumulate(totals, row);

  const byYear = years.map((y) => {
    const yearTotals = emptyTotals();
    for (const row of realized) if (row.date && yearOf(row.date) === y) accumulate(yearTotals, row);
    return { year: y, ...finish(yearTotals) };
  });

  const byMonth = year === null ? [] : Array.from({ length: 12 }, (_, index) => {
    const monthTotals = emptyTotals();
    for (const row of inPeriod) if (row.date && row.date.getUTCMonth() === index) accumulate(monthTotals, row);
    return { month: index + 1, ...finish(monthTotals) };
  });

  // Uma viagem com vários destinos aparece como um item próprio ("A + B + C"):
  // dividir o resultado entre os lugares seria inventar um rateio.
  const places = (row: FinanceOutingInput) => [{ destinationId: row.destinationId, destinationName: row.destinationName }, ...(row.stops ?? [])];
  const destinations = new Map<string, { key: string; destinationId: string; destinationIds: string[]; name: string; totals: Totals }>();
  for (const row of inPeriod) {
    const list = places(row);
    const key = list.map((place) => place.destinationId).sort().join('+');
    const entry = destinations.get(key) ?? { key, destinationId: row.destinationId, destinationIds: list.map((place) => place.destinationId), name: list.map((place) => place.destinationName).join(' + '), totals: emptyTotals() };
    accumulate(entry.totals, row);
    destinations.set(key, entry);
  }
  const byDestination = [...destinations.values()]
    .map(({ totals: t, ...entry }) => ({ ...entry, ...finish(t) }))
    .sort((a, b) => b.resultCents - a.resultCents || b.outings - a.outings || a.name.localeCompare(b.name, 'pt-BR'));

  const view = (row: FinanceOutingInput) => ({
      id: row.id, destinationId: row.destinationId, destinationName: row.destinationName,
      stops: row.stops ?? [], status: statusOf.get(row.id)!.status, statusConfirmed: statusOf.get(row.id)!.confirmed,
      date: row.date ? row.date.toISOString() : null, passengers: row.passengers, courtesySeats: row.courtesySeats, pricePerPersonCents: row.pricePerPersonCents,
      ...outingTotals(row), missing: missingFields(row),
      siteImported: isSiteCreatedOuting(row),
      source: outingSource(row),
  });
  const newestFirst = (a: { date: string | null }, b: { date: string | null }) => (b.date ?? '').localeCompare(a.date ?? '');
  const outings = inPeriod.map(view).sort(newestFirst);
  const inYear = (row: FinanceOutingInput) => year === null || (row.date !== null && yearOf(row.date) === year);
  // Criadas pelo site e ainda não confirmadas: listadas à parte para a equipe confirmar.
  const toConfirm = rows.filter((row) => statusOf.get(row.id)!.status === 'UNCONFIRMED' && inYear(row)).map(view).sort(newestFirst);

  // Saídas fora dos totais, para a equipe saber que existem (mesmo período).
  const statusCount = (status: EffectiveOutingStatus) => rows.filter((row) => statusOf.get(row.id)!.status === status && inYear(row)).length;

  return {
    years,
    year,
    plannedOutings: statusCount('PLANNED'),
    cancelledOutings: statusCount('CANCELLED'),
    // Criadas pelo site e ainda sem confirmação: fora dos totais até a equipe marcar "realizada".
    unconfirmedOutings: statusCount('UNCONFIRMED'),
    // Registros históricos sem status que seguem a regra antiga (contam nos totais).
    legacyRealizedOutings: outings.filter((outing) => !outing.statusConfirmed).length,
    totals: finish(totals),
    incompleteOutings: outings.filter((outing) => outing.missing.length > 0).length,
    byYear,
    byMonth,
    byDestination,
    outings,
    toConfirm,
  };
}

// ── Reservas e parcelas ───────────────────────────────────────────────────
// Mesmo filtro de acesso das telas de reserva (ver reservationAccessWhereSql
// em legacyTourismScope.ts), recebido pronto para não duplicar a regra.

type RawClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

// Vencimentos são dias civis armazenados ao meio-dia UTC. Usar o calendário
// de São Paulo evita considerar uma parcela vencida antes da meia-noite local.
const financeDayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});

function startOfFinanceDay(now: Date): number {
  const parts = financeDayFormatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day'));
}

export async function summarizeReservations(client: RawClient, accessJoin: Prisma.Sql, accessWhere: Prisma.Sql, now = new Date()) {
  const startOfToday = startOfFinanceDay(now);
  const in30Days = startOfToday + 31 * 86400000;
  const num = (value: unknown) => Number(value ?? 0);

  const [reservation] = await client.$queryRaw<Array<{ active: bigint; contracted: bigint | null; seats: bigint | null }>>(Prisma.sql`
    SELECT COUNT(*) AS active, SUM(r."totalCents") AS contracted, SUM(r."seats") AS seats
    ${accessJoin} WHERE ${accessWhere} AND r."status" != 'CANCELLED' AND r."needsReview" = 0
  `);
  const [installments] = await client.$queryRaw<Array<{ received: bigint | null; open: bigint | null; overdue: bigint | null; overdueCount: bigint; next30: bigint | null }>>(Prisma.sql`
    SELECT
      SUM(CASE WHEN i."paidAt" IS NOT NULL THEN i."amountCents" ELSE 0 END) AS received,
      SUM(CASE WHEN i."paidAt" IS NULL THEN i."amountCents" ELSE 0 END) AS open,
      SUM(CASE WHEN i."paidAt" IS NULL AND i."dueDate" IS NOT NULL AND i."dueDate" < ${startOfToday} THEN i."amountCents" ELSE 0 END) AS overdue,
      SUM(CASE WHEN i."paidAt" IS NULL AND i."dueDate" IS NOT NULL AND i."dueDate" < ${startOfToday} THEN 1 ELSE 0 END) AS overdueCount,
      SUM(CASE WHEN i."paidAt" IS NULL AND i."dueDate" >= ${startOfToday} AND i."dueDate" < ${in30Days} THEN i."amountCents" ELSE 0 END) AS next30
    FROM "ReservationInstallment" i
    WHERE i."reservationId" IN (SELECT r."id" ${accessJoin} WHERE ${accessWhere} AND r."status" != 'CANCELLED' AND r."needsReview" = 0)
  `);
  const pending = await client.$queryRaw<Array<{ id: string; reservationId: string; customerName: string; tripTitle: string; amountCents: number; dueDate: number | bigint | null }>>(Prisma.sql`
    SELECT i."id" AS id, r."id" AS reservationId, r."customerName" AS customerName, t."title" AS tripTitle, i."amountCents" AS amountCents, i."dueDate" AS dueDate
    ${accessJoin} JOIN "ReservationInstallment" i ON i."reservationId" = r."id"
    WHERE ${accessWhere} AND r."status" != 'CANCELLED' AND r."needsReview" = 0 AND i."paidAt" IS NULL AND i."dueDate" IS NOT NULL AND i."dueDate" < ${in30Days}
    ORDER BY i."dueDate" ASC, i."id" ASC
    LIMIT 20
  `);

  // Pedidos do WhatsApp ainda não revisados ficam fora dos totais acima; só contados.
  const [review] = await client.$queryRaw<Array<{ awaiting: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS awaiting ${accessJoin} WHERE ${accessWhere} AND r."status" != 'CANCELLED' AND r."needsReview" = 1
  `);
  const contractedCents = num(reservation?.contracted);
  const receivedCents = num(installments?.received);
  return {
    activeReservations: num(reservation?.active),
    awaitingReviewReservations: num(review?.awaiting),
    seats: num(reservation?.seats),
    contractedCents,
    receivedCents,
    // O que falta receber do contratado (parcelas lançadas ou não).
    receivableCents: Math.max(0, contractedCents - receivedCents),
    openInstallmentsCents: num(installments?.open),
    overdueCents: num(installments?.overdue),
    overdueInstallments: num(installments?.overdueCount),
    dueNext30DaysCents: num(installments?.next30),
    pendingInstallments: pending.map((row) => {
      const due = new Date(Number(row.dueDate));
      return { id: row.id, reservationId: row.reservationId, customerName: row.customerName, tripTitle: row.tripTitle, amountCents: Number(row.amountCents), dueDate: due.toISOString(), overdue: due.getTime() < startOfToday };
    }),
  };
}
