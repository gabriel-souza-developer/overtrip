import type { Visit } from '../api';
import { isoToLocalInput } from './dateInput';

export interface VisitEditForm {
  title: string;
  description: string;
  date: string;
  city: string;
  region: string;
  lat: number | null;
  lng: number | null;
  notes: string;
  needsReview: boolean;
  tripId: string;
}

/** Valores iniciais do formulário de edição/associação, preenchidos com os dados atuais da visita. */
export function visitToEditForm(visit: Visit): VisitEditForm {
  return {
    title: visit.title,
    description: visit.description || '',
    date: isoToLocalInput(visit.date),
    city: visit.city,
    region: visit.region,
    lat: visit.lat,
    lng: visit.lng,
    notes: visit.notes || '',
    needsReview: visit.needsReview,
    tripId: visit.tripId || '',
  };
}
