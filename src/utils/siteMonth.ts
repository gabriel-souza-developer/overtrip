import type { Prisma } from '@prisma/client';
import { toSiteDate } from '../services/publicTrips.js';

/**
 * Filtro por mês/ano no dia civil que o site mostra (ver toSiteDate):
 * - meia-noite UTC é data sem hora e vale pelo próprio dia UTC;
 * - demais instantes valem pelo dia em America/Sao_Paulo (UTC−3, sem horário de verão).
 * Assim, "2026-08-01T00:00Z" é agosto (data sem hora) e "2026-08-01T02:00Z" é 31 de julho.
 */
export function siteDayRangeWhere(fromDay: string, toDayExclusive: string): Prisma.VisitWhereInput {
  const startMidnight = new Date(`${fromDay}T00:00:00.000Z`);
  const endMidnight = new Date(`${toDayExclusive}T00:00:00.000Z`);
  return {
    OR: [
      { date: { gte: new Date(`${fromDay}T03:00:00.000Z`), lt: new Date(`${toDayExclusive}T03:00:00.000Z`), not: endMidnight } },
      { date: startMidnight },
    ],
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Intervalo [início, fim) em dias AAAA-MM-DD para um ano ou um mês de um ano. */
export function periodBounds(year: number, month?: number): [string, string] {
  if (month === undefined) return [`${year}-01-01`, `${year + 1}-01-01`];
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return [`${year}-${pad(month)}-01`, `${nextYear}-${pad(nextMonth)}-01`];
}

export function visitPeriodWhere(year: number, month?: number): Prisma.VisitWhereInput {
  const [from, to] = periodBounds(year, month);
  return siteDayRangeWhere(from, to);
}

export interface VisitPeriod { year: number; month: number; count: number }

/** Meses (do mais recente ao mais antigo) que têm visitas, com a contagem; datas vazias ficam de fora. */
export function summarizeVisitPeriods(dates: (Date | null)[]): { periods: VisitPeriod[]; undated: number } {
  const counts = new Map<string, number>();
  let undated = 0;
  for (const date of dates) {
    if (!date) { undated++; continue; }
    const key = toSiteDate(date).slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const periods = [...counts.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, count]) => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)), count }));
  return { periods, undated };
}
