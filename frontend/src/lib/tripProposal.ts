import type { TripFormData } from '../api';
import { formatDateBR } from './dateInput';
import { formatBRL } from './formHelpers';
import { displayTime } from './tripSchedule';

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
  // Mesma regra do site (js/render.js): horário preenchido aparece; "a confirmar" só quando não há nenhum.
  // O formulário guarda a hora em 'HH:mm'; aqui ela sai como no site ('05h30').
  const departure = displayTime(trip.departureTime);
  const back = displayTime(trip.returnTime);
  const times = [departure && `Saída: ${departure}`, back && `Retorno: ${back}`].filter(Boolean).join(' · ');
  return {
    organizer: text(organizer) || 'Agência ou organizador',
    title: text(trip.title) || 'Nova viagem',
    description: text(trip.description),
    destination: destination || null,
    date: date === '—' ? null : date,
    schedule: text(trip.scheduleInfo) || times || (trip.scheduleTBD ? 'A confirmar' : null),
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
