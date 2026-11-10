export type HealthState = 'ok' | 'alert' | 'stale' | 'unavailable';
export interface HealthCheck { status: 'ok' | 'alert' | 'metric'; message: string }
export interface SystemHealth { state: HealthState; checkedAt: string | null; ageMinutes: number | null; checks: HealthCheck[] }
export interface SystemHealthHistoryPoint { checkedAt: string; ok: boolean; checks: HealthCheck[] }

export interface HealthChartPoint { checkedAt: string; diskUsed: number | null; memoryAvailable: number | null; loadPerCore: number | null }

/** Converte as métricas textuais do monitor para percentuais que o gráfico pode desenhar. */
export function healthChartPoints(history: SystemHealthHistoryPoint[]): HealthChartPoint[] {
  return history.map(({ checkedAt, checks }) => {
    let diskUsed: number | null = null;
    let memoryAvailable: number | null = null;
    let load: number | null = null;
    let cpus: number | null = null;
    for (const check of checks) {
      const disk = check.message.match(/^disco utilizado: (\d+)%/i);
      const memory = check.message.match(/^memória disponível: (\d+)%/i);
      const cpuLoad = check.message.match(/carga 1 minuto=([\d.]+); CPUs=(\d+)/i);
      if (disk) diskUsed = Number(disk[1]);
      if (memory) memoryAvailable = Number(memory[1]);
      if (cpuLoad) { load = Number(cpuLoad[1]); cpus = Number(cpuLoad[2]); }
    }
    const loadPerCore = load !== null && cpus ? Math.min(100, load / cpus * 100) : null;
    return { checkedAt, diskUsed, memoryAvailable, loadPerCore };
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
