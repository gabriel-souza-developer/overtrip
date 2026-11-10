export type HealthState = 'ok' | 'alert' | 'stale' | 'unavailable';
export interface HealthCheck { status: 'ok' | 'alert' | 'metric'; message: string }
export interface SystemHealth { state: HealthState; checkedAt: string | null; ageMinutes: number | null; checks: HealthCheck[] }

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
