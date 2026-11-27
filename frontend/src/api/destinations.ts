import { request, type Pagination } from './index';

// Banco PRIVADO de destinos (painel OVERTRIP, só administradores). Nunca
// aparece no site: o mapa público vem de "Destinos visitados".

export type DestinationStatus = 'IDEA' | 'PRIORITY' | 'DISCARDED';
export type TrailLevel = 'EASY' | 'MODERATE' | 'HARD';
export const DESTINATION_CATEGORIES = ['Cachoeira', 'Praia', 'Rio', 'Mirante', 'Trilha', 'Camping', 'Balneário', 'Gruta', 'Lagoa', 'Outro'] as const;
export type DestinationCategory = typeof DESTINATION_CATEGORIES[number];

export const STATUS_LABELS: Record<DestinationStatus, string> = { IDEA: 'Padrão', PRIORITY: 'Prioridade', DISCARDED: 'Descartado' };
export const TRAIL_LABELS: Record<TrailLevel, string> = { EASY: 'Fácil', MODERATE: 'Moderada', HARD: 'Difícil' };

export interface DestinationLink { label: string; url: string }

/** Situação gravada da saída; null = registro anterior, sem confirmação. */
export type OutingStatus = 'PLANNED' | 'REALIZED' | 'CANCELLED';
/** UNCONFIRMED: criada pelo site e ainda não confirmada (fora dos totais). */
export type EffectiveOutingStatus = OutingStatus | 'UNCONFIRMED';
export const OUTING_STATUS_LABELS: Record<EffectiveOutingStatus, string> = { PLANNED: 'Planejada', REALIZED: 'Realizada', CANCELLED: 'Cancelada', UNCONFIRMED: 'A confirmar' };

/** Origem gravada na criação (não muda ao editar as observações); null = registro anterior da equipe ou da planilha. */
export type OutingSource = 'SITE' | 'SHEET' | 'TEAM';

export interface OutingTrip {
  role: 'primary' | 'stop';
  /** null quando a principal está fora do escopo (não exposta). */
  primaryOutingId: string | null;
  primaryDestinationId: string | null;
  primaryDate?: string | null;
  destinations: Array<{ id: string; name: string }>;
}

export interface DestinationOuting {
  id: string;
  date: string | null;
  status: OutingStatus | null;
  effectiveStatus: EffectiveOutingStatus;
  /** false = sem status gravado (registro anterior ou criado pelo site). */
  statusConfirmed: boolean;
  parentOutingId: string | null;
  /** Viagem com vários destinos (null = saída de um destino só). */
  trip: OutingTrip | null;
  passengers: number | null;
  courtesySeats: number | null;
  pricePerPersonCents: number | null;
  transportCostCents: number | null;
  extraCostCents: number | null;
  supplier: string | null;
  notes: string | null;
  source: OutingSource | null;
  updatedAt: string;
  revenueCents: number | null;
  expenseCents: number | null;
  resultCents: number | null;
  /** Mesmo dia de uma visita do mapa ou de uma viagem do site. */
  onSite: boolean;
}

export interface SiteVisit { id: string; title: string; date: string | null; onMap: boolean }
export interface SiteTrip {
  id: string; title: string; date: string; status: string; pricePerPersonCents: number | null;
  description: string; intensityClass: string; trailDistance: string | null;
}
export interface SiteSyncReport { linkedVisits: number; linkedTrips: number; createdDestinations: number; createdOutings: number; filledFields: number }

export interface Destination {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  category: DestinationCategory | null;
  status: DestinationStatus;
  originCity: string | null;
  distanceKm: number | null;
  trailLevel: TrailLevel | null;
  bestSeason: string | null;
  notes: string | null;
  links: DestinationLink[];
  imported: boolean;
  createdAt: string;
  updatedAt: string;
  outings: DestinationOuting[];
  summary: {
    outingsCount: number;
    lastOutingDate: string | null;
    averagePassengers: number | null;
    averagePricePerPersonCents: number | null;
    averageExpenseCents: number | null;
    averageResultCents: number | null;
  };
  /** O que o site publica sobre o destino (lido do registro original). */
  site: { onMap: boolean; visits: SiteVisit[]; trips: SiteTrip[] };
}

export type DestinationInput = Pick<Destination, 'name' | 'city' | 'region' | 'category' | 'status' | 'originCity' | 'distanceKm' | 'trailLevel' | 'bestSeason' | 'notes' | 'links'>;
export type OutingInput = Pick<DestinationOuting, 'status' | 'passengers' | 'courtesySeats' | 'pricePerPersonCents' | 'transportCostCents' | 'extraCostCents' | 'supplier' | 'notes'> & { date: string | null };

export interface DestinationFilters {
  page?: number; limit?: number; search?: string; status?: string; category?: string; trailLevel?: string; visited?: string; maxDistanceKm?: string; onMap?: string; sort?: string;
}

const send = <T>(path: string, method: string, body?: unknown) => request<T>(`/destinations${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const destinationApi = {
  list: (filters: DestinationFilters) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params.set(key, String(value));
    return request<{ data: Destination[]; pagination: Pagination }>(`/destinations?${params}`);
  },
  create: (data: DestinationInput) => send<Destination>('', 'POST', data),
  update: (id: string, data: Partial<DestinationInput> & { expectedUpdatedAt: string }) => send<Destination>(`/${encodeURIComponent(id)}`, 'PUT', data),
  syncSite: () => send<SiteSyncReport>('/sync-site', 'POST'),
  remove: (id: string) => send<void>(`/${encodeURIComponent(id)}`, 'DELETE'),
  addOuting: (id: string, data: OutingInput) => send<Destination>(`/${encodeURIComponent(id)}/outings`, 'POST', data),
  updateOuting: (id: string, outingId: string, data: OutingInput) => send<Destination>(`/${encodeURIComponent(id)}/outings/${encodeURIComponent(outingId)}`, 'PUT', data),
  removeOuting: (id: string, outingId: string) => send<Destination>(`/${encodeURIComponent(id)}/outings/${encodeURIComponent(outingId)}`, 'DELETE'),
  /** Junta outra saída (ou um destino sem saída) à viagem cuja principal é outingId. */
  addStop: (id: string, outingId: string, body: { outingId: string } | { destinationId: string }) => send<Destination>(`/${encodeURIComponent(id)}/outings/${encodeURIComponent(outingId)}/stops`, 'POST', body),
  removeStop: (id: string, outingId: string, stopId: string) => send<Destination>(`/${encodeURIComponent(id)}/outings/${encodeURIComponent(outingId)}/stops/${encodeURIComponent(stopId)}`, 'DELETE'),
};
