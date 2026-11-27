/** Copia somente o formulário, removendo dados que dependem da edição anterior. */
export function prepareTripTemplate<T extends {
  startDateISO: string; endDateISO: string; headlineDisplay: string; scheduleInfo: string;
  departureTime?: string; returnTime?: string; departureTolerance?: string;
  scheduleTBD?: boolean; departures?: unknown[];
  spotsLeft: number | null; status: string; availabilitySchema: string;
}>(trip: T): T {
  return {
    ...trip,
    startDateISO: '', endDateISO: '', headlineDisplay: '',
    departureTime: '', departureTolerance: '', returnTime: '', scheduleInfo: '', scheduleTBD: true,
    departures: [], spotsLeft: null, status: 'DRAFT', availabilitySchema: 'https://schema.org/InStock',
  };
}

/**
 * Mesma ideia de prepareTripTemplate, para o formulário de viagens do painel
 * de empresa (OrganizationTrips.tsx): copia o conteúdo reaproveitável (texto,
 * preço, fotos já pertencentes à empresa, o que inclui) e limpa tudo que é
 * específico da edição anterior — data/horário, o rótulo de exibição ligado
 * a eles, vagas restantes e os embarques antigos (cada item tem um horário
 * daquela execução específica). O servidor (POST .../tourism/trips) sempre
 * cria um registro novo, gera identidade própria e força status DRAFT, então
 * nenhum identificador ou dado de reserva da viagem de origem chega a este
 * formulário para começar.
 */
export function prepareOrgTripTemplate<T extends {
  startDateISO: string; endDateISO: string; headlineDisplay: string;
  departureTime: string; returnTime: string; scheduleInfo: string; scheduleTBD: boolean;
  spotsLeft: string; departures: unknown[];
}>(trip: T): T {
  return {
    ...trip,
    startDateISO: '', endDateISO: '', headlineDisplay: '',
    departureTime: '', returnTime: '', scheduleInfo: '', scheduleTBD: false,
    spotsLeft: '', departures: [],
  };
}
