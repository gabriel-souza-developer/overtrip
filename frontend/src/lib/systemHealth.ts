export type HealthState = 'ok' | 'alert' | 'stale' | 'unavailable';
export interface HealthCheck { status: 'ok' | 'alert' | 'metric'; message: string }
export interface SystemHealth { state: HealthState; checkedAt: string | null; ageMinutes: number | null; checks: HealthCheck[] }
export interface SystemHealthHistoryPoint { checkedAt: string; ok: boolean; checks: HealthCheck[] }

export interface HealthChartPoint {
  checkedAt: string;
  diskUsed: number | null;
  memoryAvailable: number | null;
  loadAverage: number | null;
  cpuCount: number | null;
}

/** Agrupa coletas densas em intervalos para o gráfico continuar legível e leve. */
export function aggregateHealthPoints(points: HealthChartPoint[], intervalMs: number): HealthChartPoint[] {
  const buckets = new Map<number, HealthChartPoint[]>();
  for (const point of points) {
    const timestamp = Date.parse(point.checkedAt);
    const bucket = Math.floor(timestamp / intervalMs) * intervalMs;
    const entries = buckets.get(bucket);
    if (entries) entries.push(point);
    else buckets.set(bucket, [point]);
  }
  return [...buckets.entries()].sort(([a], [b]) => a - b).map(([, entries]) => {
    const average = (key: keyof Omit<HealthChartPoint, 'checkedAt'>): number | null => {
      const values = entries.map((entry) => entry[key]).filter((value): value is number => value !== null);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    };
    const timestamps = entries.map((entry) => Date.parse(entry.checkedAt));
    const loadValues = entries.map((entry) => entry.loadAverage).filter((value): value is number => value !== null);
    const cpuCount = [...entries].reverse().find((entry) => entry.cpuCount !== null)?.cpuCount ?? null;
    return {
      checkedAt: new Date(timestamps.reduce((sum, timestamp) => sum + timestamp, 0) / timestamps.length).toISOString(),
      diskUsed: average('diskUsed'),
      memoryAvailable: average('memoryAvailable'),
      loadAverage: loadValues.length ? Math.max(...loadValues) : null,
      cpuCount,
    };
  });
}

/** Lê as métricas textuais do monitor preservando as unidades originais. */
export function healthChartPoints(history: SystemHealthHistoryPoint[]): HealthChartPoint[] {
  return history.map(({ checkedAt, checks }) => {
    let diskUsed: number | null = null;
    let memoryAvailable: number | null = null;
    let loadAverage: number | null = null;
    let cpuCount: number | null = null;
    for (const check of checks) {
      const disk = check.message.match(/^disco utilizado: (\d+)%/i);
      const memory = check.message.match(/^memória disponível: (\d+)%/i);
      const cpuLoad = check.message.match(/carga 1 minuto=([\d.]+); CPUs=(\d+)/i);
      if (disk) diskUsed = Number(disk[1]);
      if (memory) memoryAvailable = Number(memory[1]);
      if (cpuLoad) { loadAverage = Number(cpuLoad[1]); cpuCount = Number(cpuLoad[2]); }
    }
    return { checkedAt, diskUsed, memoryAvailable, loadAverage, cpuCount };
  });
}

/** Texto e cor do resumo; "desatualizado" e "indisponível" nunca aparecem como saudável. */
export function healthSummary(health: Pick<SystemHealth, 'state' | 'ageMinutes'>): { title: string; description: string; tone: 'success' | 'danger' | 'warning' } {
  const age = health.ageMinutes === null ? '' : health.ageMinutes < 1 ? 'há menos de 1 minuto' : `há ${health.ageMinutes} min`;
  switch (health.state) {
    case 'ok': return { title: 'Servidor saudável', description: `Todas as verificações passaram (${age}).`, tone: 'success' };
    case 'alert': return { title: 'Atenção no servidor', description: `Uma ou mais verificações falharam (${age}). Veja os itens em vermelho.`, tone: 'danger' };
    case 'stale': return { title: 'Monitor sem resultado recente', description: `A última verificação foi ${age}. O temporizador overtrip-health pode ter parado.`, tone: 'warning' };
    default: return { title: 'Monitor indisponível', description: 'Ainda não há resultado do monitor de saúde neste servidor.', tone: 'warning' };
  }
}
