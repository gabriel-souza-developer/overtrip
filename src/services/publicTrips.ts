import { prisma } from '../lib/prisma.js';

// Status que o site recebe. Rascunho (DRAFT) nunca sai. COMPLETED e CANCELLED
// continuam saindo porque js/render.js os trata (isUpcomingTrip) e a seção
// "realizadas" depende deles; SOLD_OUT e CLOSED seguem visíveis para o
// visitante ver a viagem encerrada em vez de ela sumir sem explicação.
export const PUBLIC_STATUSES = ['OPEN', 'SOLD_OUT', 'CLOSED', 'COMPLETED', 'CANCELLED'] as const;

const TZ_OFFSET_MS = -3 * 60 * 60 * 1000; // America/Sao_Paulo (sem horário de verão desde 2019)

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Data no formato que o site entende, sem deslocar o dia.
 * - Meia-noite UTC: vira "AAAA-MM-DD" (data sem hora). É como o import grava
 *   "2026-11-29". O banco não distingue isso de uma viagem salva com hora às
 *   21:00 de São Paulo (também 00:00 UTC); ver PENDÊNCIAS da T16.
 * - Demais casos (inclusive 00:00 de São Paulo): "AAAA-MM-DDTHH:mm:ss-03:00".
 */
export function toSiteDate(date: Date): string {
  const utc = date.getTime();
  if (utc % 86400000 === 0) return date.toISOString().slice(0, 10);
  const local = new Date(utc + TZ_OFFSET_MS);
  const ymd = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  return `${ymd}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}-03:00`;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

function parseArray<T>(value: string | null | undefined): T[] {
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

function formatDateDisplay(date: Date): string {
  const local = new Date(date.getTime() + (date.getTime() % 86400000 === 0 ? 12 * 3600000 : TZ_OFFSET_MS));
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(local);
  const label = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${label}, ${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}/${local.getUTCFullYear()}`;
}

// "Intensidade" é feminino: moderado -> "Intensidade moderada".
const INTENSITY_WORDS: Record<string, string> = { moderado: 'moderada', intenso: 'intensa', extremo: 'extrema' };

function intensityLabel(intensityClass: string): string {
  const word = (intensityClass || '').trim().toLowerCase();
  return word ? `Intensidade ${INTENSITY_WORDS[word] ?? word}` : '';
}

type DepartureRow = { time: string; place: string; city: string; mapsUrl: string | null; mapsQuery: string | null; orderIndex: number };
type TripRow = NonNullable<Awaited<ReturnType<typeof findRows>>>[number];

function findRows() {
  return prisma.trip.findMany({
    where: { status: { in: [...PUBLIC_STATUSES] } },
    include: { departures: { orderBy: { orderIndex: 'asc' } } },
  });
}

function meetingInfo(trip: TripRow): string | null {
  if (trip.departures.length > 1) {
    return trip.departures.map((d: DepartureRow) => `${d.city} (${d.place}) às ${d.time}`).join(' e ');
  }
  if (trip.meetingCity && trip.meetingPoint) return `${trip.meetingCity} (${trip.meetingPoint})`;
  return trip.meetingCity || trip.meetingPoint || null;
}

function nullIfEmpty<T>(arr: T[]): T[] | null {
  return arr.length ? arr : null;
}

/** Mapeamento explícito: só entra aqui o que o site (js/render.js, js/main.js) consome. */
export function mapPublicTrip(trip: TripRow) {
  return {
    title: trip.title,
    headlineDisplay: trip.headlineDisplay,
    category: trip.category,
    description: trip.description,
    city: trip.city,
    region: trip.region,
    meetingCity: trip.meetingCity,
    meetingPoint: trip.meetingPoint,
    meetingInfo: meetingInfo(trip),
    meetingDetails: trip.meetingDetails,
    meetingMapsQuery: trip.meetingMapsQuery,
    departures: trip.departures.map((d: DepartureRow) => ({
      time: d.time,
      place: d.place,
      city: d.city,
      ...(d.mapsUrl ? { mapsUrl: d.mapsUrl } : {}),
      ...(d.mapsQuery ? { mapsQuery: d.mapsQuery } : {}),
    })),
    scheduleInfo: trip.scheduleInfo,
    scheduleTBD: trip.scheduleTBD,
    dateDisplay: formatDateDisplay(trip.startDateISO),
    startDateISO: toSiteDate(trip.startDateISO),
    endDateISO: trip.endDateISO ? toSiteDate(trip.endDateISO) : null,
    departureTime: trip.departureTime,
    departureTolerance: trip.departureTolerance,
    returnTime: trip.returnTime,
    priceDisplay: trip.priceDisplay,
    priceUnit: trip.priceUnit,
    priceValue: trip.priceValue,
    // Sem colunas no banco (só existiam no trips.json escrito à mão).
    depositDisplay: null,
    remainingDisplay: null,
    remainingDeadlineDisplay: null,
    free: trip.free,
    spotsLeft: trip.spotsLeft,
    intensityClass: trip.intensityClass,
    intensityLabel: intensityLabel(trip.intensityClass),
    includes: parseArray<string>(trip.includes),
    includesHighlight: trip.includesHighlight,
    includedServices: nullIfEmpty(parseArray<string>(trip.includedServices)),
    itinerary: nullIfEmpty(parseArray<string>(trip.itinerary)),
    routeNotes: nullIfEmpty(parseArray<string>(trip.routeNotes)),
    importantInfo: nullIfEmpty(parseArray<string>(trip.importantInfo)),
    trailDistance: trip.trailDistance,
    supportPoint: trip.supportPoint,
    supportPointInfo: trip.supportPointInfo,
    media: parseArray<Record<string, unknown>>(trip.media),
    buttonLabel: trip.buttonLabel,
    buttonClass: trip.buttonClass,
    status: trip.status.toLowerCase(),
    availabilitySchema: trip.availabilitySchema,
  };
}

export const publicTripsService = {
  async list() {
    const rows = await findRows();
    return rows
      .map(mapPublicTrip)
      .sort((a, b) => a.startDateISO.localeCompare(b.startDateISO));
  },
};
