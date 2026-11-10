import type { TripFormData } from '../api';
import { formatDateBR } from './dateInput';
import { formatBRL } from './formHelpers';

export interface TripProposal {
  organizer: string;
  title: string;
  description: string | null;
  destination: string | null;
  date: string | null;
  schedule: string | null;
  departures: string[];
  price: string | null;
  includes: string[];
  itinerary: string[];
}
const text = (value: string | null | undefined): string | null => value?.trim() || null;

/** Preview only: missing or unapproved terms are never inferred. */
export function buildTripProposal(trip: TripFormData, organizer: string): TripProposal {
  const destination = [text(trip.city), text(trip.region)].filter(Boolean).join(' - ');
  const date = trip.startDateISO ? formatDateBR(trip.startDateISO) : '—';
  const points = trip.meetingTBD ? ['A confirmar'] : (trip.departures ?? [])
    .map(p => [text(p.time), text(p.place), text(p.city)].filter(Boolean).join(' · ')).filter(Boolean);
  if (!points.length && !trip.meetingTBD) {
    const legacy = [text(trip.meetingPoint), text(trip.meetingCity)].filter(Boolean).join(' · ');
    if (legacy) points.push(legacy);
  }
  const priceDisplay = text(trip.priceDisplay);
  const price = trip.free ? 'Gratuito' : priceDisplay || (trip.priceValue != null && trip.priceValue > 0 ? formatBRL(trip.priceValue) : null);
  const times = [text(trip.departureTime) && `Saída: ${text(trip.departureTime)}`, text(trip.returnTime) && `Retorno: ${text(trip.returnTime)}`].filter(Boolean).join(' · ');
  return {
    organizer: text(organizer) || 'Organizador',
    title: text(trip.title) || 'Viagem sem nome',
    description: text(trip.description),
    destination: destination || null,
    date: date === '—' ? null : date,
    schedule: trip.scheduleTBD ? 'A confirmar' : text(trip.scheduleInfo) || times || null,
    departures: points,
    price: price ? `${price}${!trip.free && text(trip.priceUnit) ? ` ${text(trip.priceUnit)}` : ''}` : null,
    includes: (trip.includes ?? []).map(x => x.trim()).filter(Boolean),
    itinerary: (trip.itinerary ?? []).map(x => x.trim()).filter(Boolean),
  };
}

/** Clipboard content is generated only when the user explicitly copies it. */
export function tripProposalText(p: TripProposal): string {
  const lines = [p.organizer, p.title];
  if (p.description) lines.push('', p.description);
  if (p.destination) lines.push('', `Destino: ${p.destination}`);
  if (p.date) lines.push(`Data: ${p.date}`);
  if (p.schedule) lines.push(`Horário: ${p.schedule}`);
  if (p.departures.length) lines.push('', 'Embarques:', ...p.departures.map(point => `• ${point}`));
  if (p.price) lines.push('', `Valor: ${p.price}`);
  if (p.includes.length) lines.push('', 'Inclui:', ...p.includes.map(item => `• ${item}`));
  if (p.itinerary.length) lines.push('', 'Roteiro:', ...p.itinerary.map(item => `• ${item}`));
  return lines.join('\n');
}
