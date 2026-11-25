import { Prisma } from '@prisma/client';
import { outingTotals } from './destinationBank.js';

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

/** `year` null = todos os anos. Saídas futuras ficam de fora; sem data, só no total geral. */
export function summarizeFinanceOutings(rows: FinanceOutingInput[], year: number | null, now = new Date()) {
  const realized = rows.filter((row) => row.date === null || row.date.getTime() <= now.getTime());
  const years = [...new Set(realized.flatMap((row) => (row.date ? [yearOf(row.date)] : [])))].sort((a, b) => a - b);
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

  const destinations = new Map<string, { destinationId: string; name: string; totals: Totals }>();
  for (const row of inPeriod) {
    const entry = destinations.get(row.destinationId) ?? { destinationId: row.destinationId, name: row.destinationName, totals: emptyTotals() };
    accumulate(entry.totals, row);
    destinations.set(row.destinationId, entry);
  }
  const byDestination = [...destinations.values()]
    .map(({ destinationId, name, totals: t }) => ({ destinationId, name, ...finish(t) }))
    .sort((a, b) => b.resultCents - a.resultCents || b.outings - a.outings || a.name.localeCompare(b.name, 'pt-BR'));

  const outings = inPeriod
    .map((row) => ({
      id: row.id, destinationId: row.destinationId, destinationName: row.destinationName,
      date: row.date ? row.date.toISOString() : null, passengers: row.passengers, courtesySeats: row.courtesySeats, pricePerPersonCents: row.pricePerPersonCents,
      ...outingTotals(row), missing: missingFields(row),
    }))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  return {
    years,
    year,
    totals: finish(totals),
    incompleteOutings: outings.filter((outing) => outing.missing.length > 0).length,
    byYear,
    byMonth,
    byDestination,
    outings,
  };
}

// ── Reservas e parcelas ───────────────────────────────────────────────────
// Mesmo filtro de acesso das telas de reserva (ver reservationAccessWhereSql
// em legacyTourismScope.ts), recebido pronto para não duplicar a regra.

type RawClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

export async function summarizeReservations(client: RawClient, accessJoin: Prisma.Sql, accessWhere: Prisma.Sql, now = new Date()) {
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const in30Days = startOfToday + 31 * 86400000;
  const num = (value: unknown) => Number(value ?? 0);

  const [reservation] = await client.$queryRaw<Array<{ active: bigint; contracted: bigint | null; seats: bigint | null }>>(Prisma.sql`
    SELECT COUNT(*) AS active, SUM(r."totalCents") AS contracted, SUM(r."seats") AS seats
    ${accessJoin} WHERE ${accessWhere} AND r."status" != 'CANCELLED'
  `);
  const [installments] = await client.$queryRaw<Array<{ received: bigint | null; open: bigint | null; overdue: bigint | null; overdueCount: bigint; next30: bigint | null }>>(Prisma.sql`
    SELECT
      SUM(CASE WHEN i."paidAt" IS NOT NULL THEN i."amountCents" ELSE 0 END) AS received,
      SUM(CASE WHEN i."paidAt" IS NULL THEN i."amountCents" ELSE 0 END) AS open,
      SUM(CASE WHEN i."paidAt" IS NULL AND i."dueDate" IS NOT NULL AND i."dueDate" < ${startOfToday} THEN i."amountCents" ELSE 0 END) AS overdue,
      SUM(CASE WHEN i."paidAt" IS NULL AND i."dueDate" IS NOT NULL AND i."dueDate" < ${startOfToday} THEN 1 ELSE 0 END) AS overdueCount,
      SUM(CASE WHEN i."paidAt" IS NULL AND i."dueDate" >= ${startOfToday} AND i."dueDate" < ${in30Days} THEN i."amountCents" ELSE 0 END) AS next30
    FROM "ReservationInstallment" i
    WHERE i."reservationId" IN (SELECT r."id" ${accessJoin} WHERE ${accessWhere} AND r."status" != 'CANCELLED')
  `);
  const pending = await client.$queryRaw<Array<{ id: string; reservationId: string; customerName: string; tripTitle: string; amountCents: number; dueDate: number | bigint | null }>>(Prisma.sql`
    SELECT i."id" AS id, r."id" AS reservationId, r."customerName" AS customerName, t."title" AS tripTitle, i."amountCents" AS amountCents, i."dueDate" AS dueDate
    ${accessJoin} JOIN "ReservationInstallment" i ON i."reservationId" = r."id"
    WHERE ${accessWhere} AND r."status" != 'CANCELLED' AND i."paidAt" IS NULL AND i."dueDate" IS NOT NULL AND i."dueDate" < ${in30Days}
    ORDER BY i."dueDate" ASC, i."id" ASC
    LIMIT 20
  `);

  const contractedCents = num(reservation?.contracted);
  const receivedCents = num(installments?.received);
  return {
    activeReservations: num(reservation?.active),
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
