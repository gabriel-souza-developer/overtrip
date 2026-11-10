/** Copia somente o formulário, removendo dados que dependem da edição anterior. */
export function prepareTripTemplate<T extends {
  startDateISO: string; endDateISO: string; headlineDisplay: string; scheduleInfo: string;
  spotsLeft: number | null; status: string; availabilitySchema: string;
}>(trip: T): T {
  return { ...trip, startDateISO: '', endDateISO: '', headlineDisplay: '', scheduleInfo: '', spotsLeft: null, status: 'DRAFT', availabilitySchema: 'https://schema.org/InStock' };
}
