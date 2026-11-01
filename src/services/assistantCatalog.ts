import { prisma } from '../lib/prisma.js';
import { assistantProblems } from './tripReadiness.js';
import { toSiteDate } from './publicTrips.js';

type CatalogTrip = {
  title: string;
  city: string;
  region: string;
  startDateISO: Date;
  endDateISO: Date | null;
  departureTime: string | null;
  returnTime: string | null;
  scheduleTBD: boolean;
  meetingCity: string | null;
  meetingPoint: string | null;
  meetingTBD: boolean;
  priceValue: number | null;
  priceUnit: string;
  free: boolean;
  spotsLeft: number | null;
  description: string;
  includes: string;
  itinerary: string | null;
  importantInfo: string | null;
  media: string;
  status: string;
};

function jsonArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const data = JSON.parse(value);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function jsonList(value: string | null): string[] {
  return jsonArray(value).filter((item): item is string => typeof item === 'string');
}

/**
 * Projeção mínima para um futuro conector autenticado do Agente OVERTRIP.
 * Não contém IDs internos, mídia, documentos, custos, notas, dados de clientes
 * nem links de pagamento. Este serviço não é uma rota HTTP pública.
 */
export function toAssistantCatalogTrip(trip: CatalogTrip) {
  const problems = assistantProblems({ ...trip, media: jsonArray(trip.media) });
  if (problems.length > 0) return null;

  return {
    title: trip.title,
    destination: { city: trip.city, region: trip.region },
    schedule: {
      startDateISO: toSiteDate(trip.startDateISO),
      endDateISO: trip.endDateISO ? toSiteDate(trip.endDateISO) : null,
      departureTime: trip.departureTime,
      returnTime: trip.returnTime,
      scheduleTBD: trip.scheduleTBD,
    },
    departure: trip.meetingTBD
      ? { status: 'CONFIRMAR_COM_EQUIPE' as const }
      : { status: 'DEFINIDO' as const, city: trip.meetingCity, place: trip.meetingPoint },
    price: trip.free
      ? { free: true as const }
      : { free: false as const, value: trip.priceValue, unit: trip.priceUnit },
    availability: trip.spotsLeft === null ? 'CONFIRMAR_COM_EQUIPE' as const : trip.spotsLeft,
    description: trip.description,
    includes: jsonList(trip.includes),
    itinerary: jsonList(trip.itinerary),
    importantInfo: jsonList(trip.importantInfo),
    handoffRequiredForBooking: true,
  };
}

export const assistantCatalogService = {
  async list() {
    const rows = await prisma.trip.findMany({ where: { status: 'OPEN' } });
    return rows
      .map(toAssistantCatalogTrip)
      .filter((trip): trip is NonNullable<typeof trip> => trip !== null)
      .sort((a, b) => a.schedule.startDateISO.localeCompare(b.schedule.startDateISO));
  },
};
