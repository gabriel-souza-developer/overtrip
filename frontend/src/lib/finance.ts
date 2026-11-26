// Regras puras do painel financeiro (formatação, variação e escala do gráfico).

export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const money = (cents: number | null) => (cents === null ? '—' : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }));

/** R$ 1,9 mil — para eixos e rótulos curtos. */
export function compactMoney(cents: number): string {
  const reais = cents / 100;
  const abs = Math.abs(reais);
  if (abs >= 1000) return `${reais < 0 ? '−' : ''}R$ ${(abs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `${reais < 0 ? '−' : ''}R$ ${abs.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

/**
 * Variação percentual contra o período anterior. Nula quando não há base de
 * comparação (anterior zero ou ausente) — nunca "infinito" nem inventada.
 */
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/** Diferença em pontos percentuais (para a margem). */
export function pointsChange(current: number | null, previous: number | null | undefined): number | null {
  if (current === null || previous === null || previous === undefined) return null;
  return Math.round((current - previous) * 10) / 10;
}

/** Escala "redonda" do eixo: inclui o zero e os extremos, em passos 1/2/2,5/5 × 10^n. */
export function niceScale(values: number[], ticks = 4): { min: number; max: number; step: number } {
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  if (low === high) return { min: 0, max: 1, step: 1 };
  const raw = (high - low) / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? 10 * magnitude;
  return { min: Math.floor(low / step) * step, max: Math.ceil(high / step) * step, step };
}

export const MISSING_LABELS: Record<string, string> = { passengers: 'passageiros', pricePerPerson: 'valor por pessoa', costs: 'custos' };
