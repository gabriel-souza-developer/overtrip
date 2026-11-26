import { z } from 'zod';

// Banco privado de destinos: regras puras (validação, links e resumo das
// saídas), separadas da rota para serem testáveis sem banco.

export const DESTINATION_STATUSES = ['IDEA', 'PRIORITY', 'DISCARDED'] as const;
export const TRAIL_LEVELS = ['EASY', 'MODERATE', 'HARD'] as const;
export const OUTING_STATUSES = ['PLANNED', 'REALIZED', 'CANCELLED'] as const;
export type OutingStatus = typeof OUTING_STATUSES[number];
export const DESTINATION_CATEGORIES = ['Cachoeira', 'Praia', 'Rio', 'Mirante', 'Trilha', 'Camping', 'Balneário', 'Gruta', 'Lagoa', 'Outro'] as const;
export const MAX_DESTINATION_LINKS = 6;

export interface DestinationLink { label: string; url: string }

const httpUrl = z.string().trim().max(600).url('Link inválido').refine((value) => /^https?:\/\//i.test(value), 'Use um link http(s)');
export const destinationLinkSchema = z.object({
  label: z.string().trim().min(1, 'Dê um nome ao link').max(60),
  url: httpUrl,
}).strict();

const optionalText = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional()
  .transform((value) => (value === undefined ? undefined : value || null));

export const destinationFields = {
  name: z.string().trim().min(1, 'Nome é obrigatório').max(200, 'Nome longo demais'),
  city: optionalText(120),
  region: optionalText(60),
  category: z.union([z.enum(DESTINATION_CATEGORIES), z.null()]).optional(),
  status: z.enum(DESTINATION_STATUSES).optional(),
  originCity: optionalText(120),
  distanceKm: z.union([z.number().int().min(0).max(20000), z.null()]).optional(),
  trailLevel: z.union([z.enum(TRAIL_LEVELS), z.null()]).optional(),
  bestSeason: optionalText(120),
  notes: optionalText(5000),
  links: z.array(destinationLinkSchema).max(MAX_DESTINATION_LINKS).optional(),
};

const money = z.union([z.number().int().min(0).max(100_000_000), z.null()]).optional();
export const outingFields = {
  date: z.union([z.iso.date(), z.null()]).optional(),
  status: z.union([z.enum(OUTING_STATUSES), z.null()]).optional(),
  passengers: z.union([z.number().int().min(0).max(1000), z.null()]).optional(),
  courtesySeats: z.union([z.number().int().min(0).max(1000), z.null()]).optional(),
  pricePerPersonCents: money,
  transportCostCents: money,
  extraCostCents: money,
  supplier: optionalText(120),
  notes: optionalText(2000),
};

export function parseStoredLinks(raw: string | null | undefined): DestinationLink[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const result = destinationLinkSchema.safeParse(item);
      return result.success ? [result.data] : [];
    }).slice(0, MAX_DESTINATION_LINKS);
  } catch {
    return [];
  }
}

/** Nome amigável para um link colado na planilha ou no formulário. */
export function labelForUrl(url: string): string {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return 'Link'; }
  if (host.includes('maps.app.goo.gl') || host.includes('google.') || host.includes('goo.gl')) return 'Google Maps';
  if (host.includes('wikiloc')) return 'Wikiloc';
  if (host.includes('instagram')) return 'Instagram';
  if (host.includes('tiktok')) return 'TikTok';
  if (host.includes('facebook')) return 'Facebook';
  if (host.includes('youtube') || host.includes('youtu.be')) return 'YouTube';
  return 'Link';
}

export const dayToDate = (value: string | null | undefined) => (value ? new Date(`${value}T12:00:00.000Z`) : null);

export interface OutingNumbers {
  passengers: number | null;
  courtesySeats?: number | null;
  pricePerPersonCents: number | null;
  transportCostCents: number | null;
  extraCostCents: number | null;
}

/**
 * Receita = pagantes (passageiros − cortesias) × valor por pessoa; despesa = transporte + taxas
 * extras; resultado = receita − despesa (a coluna "CAIXA" da planilha).
 * Sem passageiros ou valor por pessoa, receita e resultado ficam nulos —
 * nunca presumidos como zero.
 */
export function outingTotals(outing: OutingNumbers) {
  const paying = outing.passengers != null ? Math.max(0, outing.passengers - (outing.courtesySeats ?? 0)) : null;
  const revenueCents = paying !== null && outing.pricePerPersonCents != null ? paying * outing.pricePerPersonCents : null;
  const hasExpense = outing.transportCostCents != null || outing.extraCostCents != null;
  const expenseCents = hasExpense ? (outing.transportCostCents ?? 0) + (outing.extraCostCents ?? 0) : null;
  const resultCents = revenueCents != null && expenseCents != null ? revenueCents - expenseCents : null;
  return { revenueCents, expenseCents, resultCents };
}

const average = (values: number[]) => (values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null);

export function summarizeOutings(outings: Array<OutingNumbers & { date: Date | null }>) {
  const totals = outings.map(outingTotals);
  const dates = outings.map((outing) => outing.date).filter((date): date is Date => date !== null).sort((a, b) => b.getTime() - a.getTime());
  return {
    outingsCount: outings.length,
    lastOutingDate: dates[0]?.toISOString() ?? null,
    averagePassengers: average(outings.flatMap((outing) => (outing.passengers != null ? [outing.passengers] : []))),
    averagePricePerPersonCents: average(outings.flatMap((outing) => (outing.pricePerPersonCents != null ? [outing.pricePerPersonCents] : []))),
    averageExpenseCents: average(totals.flatMap((total) => (total.expenseCents != null ? [total.expenseCents] : []))),
    averageResultCents: average(totals.flatMap((total) => (total.resultCents != null ? [total.resultCents] : []))),
  };
}

/**
 * Origem da saída, gravada na criação e nunca alterada pela API (não está em
 * outingFields). null = registro anterior ao campo que não veio do site: a
 * migração 20261129010000_outing_source marcou como SITE as criadas pela
 * sincronização. A nota é texto livre da equipe e não decide a origem.
 */
export const OUTING_SOURCES = ['SITE', 'SHEET', 'TEAM'] as const;
export type OutingSource = typeof OUTING_SOURCES[number];
export const outingSource = (outing: { source?: string | null }): OutingSource | null =>
  (OUTING_SOURCES as readonly string[]).includes(outing.source ?? '') ? outing.source as OutingSource : null;
export const isSiteCreatedOuting = (outing: { source?: string | null }) => outing.source === 'SITE';

// Dia civil de São Paulo (mesma regra do financeiro, das listas e da validação).
const saoPauloDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
export const todayInSaoPaulo = (now = new Date()) => saoPauloDay.format(now);
/** Saídas guardam o dia civil ao meio-dia UTC: o próprio dia é a parte AAAA-MM-DD. */
export const outingDay = (date: Date) => date.toISOString().slice(0, 10);

export type EffectiveOutingStatus = OutingStatus | 'UNCONFIRMED';

/**
 * Situação efetiva de uma saída.
 * - Com status gravado, vale o status (`confirmed: true`).
 * - Sem status (registros anteriores ao campo), `confirmed: false`:
 *   - criada automaticamente a partir do site (source SITE) e já passada → UNCONFIRMED:
 *     o site (mapa ou viagem publicada) não comprova realização, então ela
 *     NÃO entra nos totais até a equipe marcar "realizada";
 *   - lançada pela equipe ou importada da planilha de destinos visitados →
 *     mantém a regra antiga (realizada se a data já passou ou não foi
 *     informada), para preservar os totais conciliados com a planilha;
 *   - data futura → planejada.
 */
export function effectiveOutingStatus(outing: { status?: string | null; date: Date | null; source?: string | null }, now = new Date()): { status: EffectiveOutingStatus; confirmed: boolean } {
  if (outing.status && (OUTING_STATUSES as readonly string[]).includes(outing.status)) return { status: outing.status as OutingStatus, confirmed: true };
  const past = outing.date === null || outingDay(outing.date) <= todayInSaoPaulo(now);
  if (!past) return { status: 'PLANNED', confirmed: false };
  return { status: isSiteCreatedOuting(outing) ? 'UNCONFIRMED' : 'REALIZED', confirmed: false };
}

/** Campos que, numa viagem com vários destinos, ficam só na saída principal. */
export const TRIP_LEVEL_FIELDS = ['status', 'passengers', 'courtesySeats', 'pricePerPersonCents', 'transportCostCents', 'extraCostCents', 'supplier'] as const;
type TripLevelField = typeof TRIP_LEVEL_FIELDS[number];

/**
 * Campos em que uma saída tem valor diferente da principal. Ao ligar uma
 * parada, ela não pode trazer valores próprios que deixariam de ser contados
 * (nada some do financeiro sem a equipe decidir).
 */
export function conflictingTripFields(primary: Partial<Record<TripLevelField, unknown>>, stop: Partial<Record<TripLevelField, unknown>>): TripLevelField[] {
  return TRIP_LEVEL_FIELDS.filter((field) => stop[field] != null && stop[field] !== primary[field]);
}
