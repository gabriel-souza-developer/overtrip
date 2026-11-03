import type { toAssistantCatalogTrip } from './assistantCatalog.js';

type CatalogTrip = NonNullable<ReturnType<typeof toAssistantCatalogTrip>>;

/** Contrato reduzido para o fluxo v31. Campos não aprovados permanecem ausentes. */
export function toN8nTrip(trip: CatalogTrip) {
  const departure = trip.departure;
  const [year, month, day] = trip.schedule.startDateISO.split('-');
  return {
    title: trip.title, city: trip.destination.city, region: trip.destination.region,
    startDateISO: trip.schedule.startDateISO, endDateISO: trip.schedule.endDateISO,
    dateDisplay: `${day}/${month}/${year}`,
    departureTime: trip.schedule.departureTime, returnTime: trip.schedule.returnTime,
    scheduleTBD: trip.schedule.scheduleTBD,
    meetingCity: departure.status === 'DEFINIDO' ? departure.city : null,
    meetingPoint: departure.status === 'DEFINIDO' ? departure.place : null,
    meetingTBD: departure.status !== 'DEFINIDO',
    free: trip.price.free, priceValue: trip.price.free ? null : trip.price.value,
    priceDisplay: trip.price.free || trip.price.value === null ? null : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(trip.price.value),
    priceUnit: trip.price.free ? null : trip.price.unit,
    spotsLeft: typeof trip.availability === 'number' ? trip.availability : null,
    status: 'open', description: trip.description, includes: trip.includes,
    itinerary: trip.itinerary, importantInfo: trip.importantInfo,
    handoffRequiredForBooking: true,
  };
}
