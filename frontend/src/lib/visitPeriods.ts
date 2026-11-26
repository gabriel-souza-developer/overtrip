import type { VisitPeriods } from '../api';

export const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
const plural = (count: number) => (count === 1 ? '1 visita' : `${count} visitas`);

export interface PeriodOption { value: string; label: string }

/** Anos com visitas (mais recente primeiro). O ano escolhido no endereço sempre aparece, mesmo sem registros. */
export function yearOptions(periods: VisitPeriods | null, selected = ''): PeriodOption[] {
  const totals = new Map<number, number>();
  for (const period of periods?.periods ?? []) totals.set(period.year, (totals.get(period.year) ?? 0) + period.count);
  if (/^\d{4}$/.test(selected) && !totals.has(Number(selected))) totals.set(Number(selected), 0);
  return [...totals.entries()].sort(([a], [b]) => b - a).map(([year, count]) => ({ value: String(year), label: `${year} (${plural(count)})` }));
}

/** Meses do ano escolhido que têm visitas (janeiro → dezembro). O mês escolhido no endereço sempre aparece. */
export function monthOptions(periods: VisitPeriods | null, year: string, selected = ''): PeriodOption[] {
  if (!year) return [];
  const counts = new Map<number, number>();
  for (const period of periods?.periods ?? []) if (String(period.year) === year) counts.set(period.month, period.count);
  const chosen = Number(selected);
  if (Number.isInteger(chosen) && chosen >= 1 && chosen <= 12 && !counts.has(chosen)) counts.set(chosen, 0);
  return [...counts.entries()].sort(([a], [b]) => a - b).map(([month, count]) => ({ value: String(month), label: `${capitalize(MONTH_NAMES[month - 1])} (${plural(count)})` }));
}
