/**
 * Regras de negócio para os diferentes níveis de prontidão de uma viagem.
 * Este arquivo não depende de HTTP nem Prisma para poder ser usado por
 * publicação, futuros jobs e o catálogo do agente.
 */
export interface TripReadinessInput {
  title?: string | null;
  city?: string | null;
  region?: string | null;
  startDateISO?: Date | string | null;
  description?: string | null;
  free?: boolean | null;
  priceValue?: number | null;
  media?: unknown;
  meetingCity?: string | null;
  meetingPoint?: string | null;
  meetingTBD?: boolean | null;
  departures?: unknown;
  status?: string | null;
  spotsLeft?: number | null;
}

const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export function hasClearDeparture(data: TripReadinessInput): boolean {
  if (data.meetingTBD) return true;
  if (Array.isArray(data.departures) && data.departures.length > 0) return data.departures.every((item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const point = item as Record<string, unknown>;
    return text(point.time) && text(point.place) && text(point.city);
  });
  return text(data.meetingCity) || text(data.meetingPoint);
}

/** Itens que precisam estar explícitos antes de a viagem aparecer no site. */
export function publicationProblems(data: TripReadinessInput): string[] {
  const missing: string[] = [];
  const media = Array.isArray(data.media) ? data.media : [];
  const hasPrice = typeof data.priceValue === 'number' && Number.isFinite(data.priceValue) && data.priceValue > 0;

  if (!text(data.title)) missing.push('informe o nome da viagem');
  if (!text(data.city) || !text(data.region)) missing.push('informe cidade e estado do destino');
  if (!data.startDateISO) missing.push('informe a data de saída');
  if (!text(data.description)) missing.push('escreva um resumo da experiência');
  if (media.length === 0) missing.push('adicione pelo menos uma foto');
  if (!data.free && !hasPrice) missing.push('informe o valor ou marque a viagem como gratuita');
  if (!hasClearDeparture(data)) missing.push('informe o embarque ou marque-o como “a confirmar”');
  return missing;
}

/**
 * O agente só pode recomendar uma viagem aberta. Vaga desconhecida é
 * permitida, mas deverá ser comunicada como sujeita à confirmação.
 */
export function assistantProblems(data: TripReadinessInput): string[] {
  const problems = publicationProblems(data);
  if (data.status !== 'OPEN') problems.push('a viagem não está disponível para recomendação');
  if (data.spotsLeft !== null && data.spotsLeft !== undefined && data.spotsLeft <= 0) {
    problems.push('não há vagas disponíveis para recomendação');
  }
  return problems;
}

