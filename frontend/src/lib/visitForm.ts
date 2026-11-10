import type { Visit } from '../api';
import { isoToLocalInput } from './dateInput';

const IMPORT_NOTES = [
  'Importado de VISITED_PLACES hardcoded (js/map.js). Trip correspondente NÃO associada automaticamente. Revisar manualmente.',
  'Importado de GALLERY hardcoded (js/data.js). Memória órfã - trip não encontrada em trips.json. Coordenadas não disponíveis. Revisar manualmente.',
];

export function cleanImportedNotes(notes: string | null): string {
  return IMPORT_NOTES.reduce((value, marker) => value.replaceAll(marker, ''), notes || '').trim();
}

export interface VisitEditForm {
  title: string;
  description: string;
  date: string;
  city: string;
  region: string;
  lat: number | null;
  lng: number | null;
  notes: string;
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
    notes: cleanImportedNotes(visit.notes),
    tripId: visit.tripId || '',
  };
}

/**
 * Valor de "falta revisar" que vai para a API ao salvar o destino.
 * "Salvar e marcar como revisado" grava false; "Salvar" mantém a situação atual
 * (pendente continua pendente, revisado continua revisado).
 */
export function reviewAfterSave(currentNeedsReview: boolean, markReviewed: boolean): boolean {
  return markReviewed ? false : currentNeedsReview;
}
