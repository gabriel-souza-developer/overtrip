import type { Prisma } from '@prisma/client';

/**
 * "Próximas" e "anteriores" seguem o dia civil de America/Sao_Paulo, como o site
 * (js/render.js, getSaoPauloDateKey) e o catálogo do assistente.
 */
export type TripPeriod = 'upcoming' | 'past';

export function saoPauloDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/**
 * Filtro Prisma por período. Uma viagem é "próxima" quando o dia dela (como o site o lê,
 * ver toSiteDate) é hoje ou depois:
 * - data sem hora é gravada à meia-noite UTC e vale pelo próprio dia (hoje = T00:00Z);
 * - data com hora vale pelo instante em São Paulo (hoje começa às 03:00Z).
 */
export function tripPeriodWhere(period: TripPeriod, now = new Date()): Prisma.TripWhereInput {
  const today = saoPauloDateKey(now);
  const dateOnlyToday = new Date(`${today}T00:00:00.000Z`);
  const startOfToday = new Date(`${today}T03:00:00.000Z`);
  return period === 'upcoming'
    ? {
      AND: [
        { OR: [{ startDateISO: { gte: startOfToday } }, { startDateISO: dateOnlyToday }] },
        { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      ],
    }
    : { AND: [{ startDateISO: { lt: startOfToday } }, { startDateISO: { not: dateOnlyToday } }] };
}
