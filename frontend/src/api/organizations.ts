import { request } from './index';

export interface OrganizationSummary { id: string; name: string; slug: string; role: string }
export interface OrganizationContext { organization: { id: string; name: string; slug: string; status: string; defaultPriceUnit: string | null; brandColor: string | null }; role: string }

export type OrgTripStatus = 'DRAFT' | 'REVIEW' | 'OPEN' | 'COMPLETED' | 'CANCELLED' | 'SOLD_OUT' | 'CLOSED';
export interface OrgTrip {
  id: string; title: string; category: string; description: string; city: string; region: string; updatedAt: string;
  startDateISO: string; endDateISO: string | null; status: OrgTripStatus;
}
export type OrgTripIntensity = 'leve' | 'moderado' | 'intenso' | 'extremo';
// `src` é o caminho canônico a reenviar ao salvar sem trocar a foto;
// `previewSrc` é a rota de leitura autenticada por empresa, para exibir a
// miniatura mesmo fora de PUBLIC_SITE_ORGANIZATION_IDS — usar nos `<img>`.
export interface OrgTripMediaItem { src: string; previewSrc: string; alt: string; focus?: string }
// O que a rota aceita ao salvar: nunca previewSrc (é só leitura).
export interface OrgTripMediaInput { src: string; alt: string; focus?: string }
export interface OrgTripDeparture { id: string; time: string; place: string; city: string; mapsUrl: string | null; mapsQuery: string | null; orderIndex: number }
// Viagem completa, só devolvida pelo próprio GET/POST/PUT do painel de
// empresa. Mídia já vem com as duas URLs (ver organizationOwnedMedia.ts).
export interface OrgTripDetail extends OrgTrip {
  headlineDisplay: string | null; filterCategory: string | null;
  departureTime: string | null; departureTolerance: string | null; returnTime: string | null;
  scheduleInfo: string | null; scheduleTBD: boolean;
  priceValue: number | null; priceDisplay: string | null; priceUnit: string; free: boolean;
  intensityClass: OrgTripIntensity; spotsLeft: number | null;
  trailDistance: string | null; supportPoint: string | null; supportPointInfo: string | null;
  meetingCity: string | null; meetingPoint: string | null; meetingTBD: boolean; meetingDetails: string | null; meetingMapsQuery: string | null;
  includes: string[]; includesHighlight: string | null; itinerary: string[]; routeNotes: string[]; importantInfo: string[];
  media: OrgTripMediaItem[]; departures: OrgTripDeparture[];
}
// Só os dados aceitos pela rota: nunca organizationId, status ou
// storedIdentity — o servidor deriva/gera tudo isso por conta própria.
// Mídia só aceita fotos já enviadas e publicadas por esta empresa.
export interface OrgTripEssentials {
  title: string; category: string; description: string; city: string; region: string;
  startDateISO: string; endDateISO?: string | null;
  headlineDisplay?: string | null; filterCategory?: string | null;
  departureTime?: string | null; departureTolerance?: string | null; returnTime?: string | null;
  scheduleInfo?: string | null; scheduleTBD?: boolean;
  priceValue?: number | null; priceDisplay?: string | null; priceUnit?: string; free?: boolean;
  intensityClass?: OrgTripIntensity; spotsLeft?: number | null;
  trailDistance?: string | null; supportPoint?: string | null; supportPointInfo?: string | null;
  meetingCity?: string | null; meetingPoint?: string | null; meetingTBD?: boolean; meetingDetails?: string | null; meetingMapsQuery?: string | null;
  includes?: string[]; includesHighlight?: string | null; itinerary?: string[]; routeNotes?: string[]; importantInfo?: string[];
  media?: OrgTripMediaInput[];
  departures?: Array<{ time: string; place: string; city: string; mapsUrl?: string | null; mapsQuery?: string | null }>;
}

export type OrgLeadStage = 'NEW' | 'CONTACTED' | 'NEGOTIATING' | 'WON' | 'LOST';
export interface OrgLead {
  id: string; name: string; phone: string | null; email: string | null; stage: OrgLeadStage;
  responsible: string | null; notes: string | null; nextFollowUpAt: string | null; createdAt: string; updatedAt: string;
  tripId: string | null;
}
// Só dados do interessado — nunca organizationId, tripId ou qualquer
// relação: o servidor deriva/gera o resto.
export interface OrgLeadEssentials {
  name: string; phone?: string | null; email?: string | null; stage?: OrgLeadStage; notes?: string | null;
  responsible?: string | null; nextFollowUpAt?: string | null;
}

export type OrgReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';
export interface OrgInstallment { id: string; amountCents: number; dueDate: string | null; paidAt: string | null; createdAt: string; updatedAt: string }
export interface OrgReservation {
  id: string; tripId: string; customerName: string; customerPhone: string | null; seats: number;
  status: OrgReservationStatus; totalCents: number; notes: string | null; createdAt: string; updatedAt: string;
  trip: { id: string; title: string; startDateISO: string };
  installments: OrgInstallment[];
  leadId: string | null;
}
// Só os essenciais aceitos pela rota: cliente, telefone, lugares e valor em
// centavos, mais o vínculo opcional com interessado (validado por completo
// no servidor). Viagem só é aceita na criação; status só na edição.
export interface OrgReservationEssentials {
  customerName: string; customerPhone?: string | null; seats: number; totalCents: number; leadId?: string | null;
}
// Toda mutação de parcela exige o updatedAt atual da RESERVA (não da
// parcela): o servidor o avança em toda escrita e recusa versão antiga.
export interface OrgInstallmentEssentials { amountCents: number; dueDate?: string | null }

export interface ListResult<T> { data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } }
// Trilha mínima de auditoria (ver ReservationAuditLog no servidor): nunca
// traz nome/telefone de cliente, valor ou observação. actorUserId é o id
// interno de quem fez a mudança; o servidor não resolve isso para nome ou
// e-mail, então a UI nunca deve mostrá-lo como se fosse um nome — ver
// ReservationHistory em OrganizationReservations.tsx.
export type OrgReservationAuditAction = 'RESERVATION_CREATED' | 'RESERVATION_UPDATED' | 'INSTALLMENT_CREATED' | 'INSTALLMENT_UPDATED' | 'INSTALLMENT_DELETED';
export interface OrgReservationAuditEntry {
  id: string; action: OrgReservationAuditAction; entityType: 'Reservation' | 'ReservationInstallment'; entityId: string;
  actorUserId: string; createdAt: string;
}
export interface OrganizationDashboardSummary { trips: { total: number; upcoming: number; open: number; drafts: number }; leads?: number; reservations?: number }
// truncated nunca deve ser ignorado pela UI: se true, há mais viagens no
// intervalo do que o servidor devolveu (limite de segurança), e a agenda
// precisa avisar em vez de mostrar os dados como se fossem completos.
export interface OrgCalendarResult { data: OrgTrip[]; total: number; truncated: boolean; range: { start: string; end: string } }

const orgPath = (organizationId: string, suffix = '') => `/organizations/${encodeURIComponent(organizationId)}${suffix}`;
const pageQuery = (params?: { page?: number; limit?: number; search?: string; status?: string; period?: string }) => {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);
  if (params?.status) query.set('status', params.status);
  if (params?.period) query.set('period', params.period);
  return query.toString();
};

export const organizationApi = {
  listMine: () => request<{ organizations: OrganizationSummary[] }>('/organizations'),

  get: (organizationId: string) => request<OrganizationContext>(orgPath(organizationId)),
  updateSettings: (organizationId: string, data: { defaultPriceUnit?: string | null; brandColor?: string | null }) =>
    request<OrganizationContext>(orgPath(organizationId, '/settings'), { method: 'PUT', body: JSON.stringify(data) }),
  dashboard: (organizationId: string) => request<OrganizationDashboardSummary>(orgPath(organizationId, '/tourism/dashboard')),
  aiStatus: (organizationId: string) => request<{ enabled: boolean }>(orgPath(organizationId, '/tourism/ai/status')),
  aiTripDraft: (organizationId: string, text: string) => request<{ draft: Record<string, string | number | boolean | string[]>; warnings: string[] }>(orgPath(organizationId, '/tourism/ai/trip-draft'), { method: 'POST', body: JSON.stringify({ text }) }),

  trips: (organizationId: string, params?: { page?: number; limit?: number; search?: string; status?: string; period?: 'upcoming' | 'past' }) =>
    request<ListResult<OrgTrip>>(`${orgPath(organizationId, '/tourism/trips')}?${pageQuery(params)}`),
  trip: (organizationId: string, tripId: string) =>
    request<OrgTripDetail>(orgPath(organizationId, `/tourism/trips/${encodeURIComponent(tripId)}`)),
  // Intervalo de datas (não paginação): a própria rota limita o período e o
  // total de resultados, então nunca busca a tabela inteira da empresa.
  calendar: (organizationId: string, range: { start: string; end: string }) =>
    request<OrgCalendarResult>(`${orgPath(organizationId, '/tourism/trips/calendar')}?${new URLSearchParams(range)}`),
  createTrip: (organizationId: string, data: OrgTripEssentials) =>
    request<OrgTripDetail>(orgPath(organizationId, '/tourism/trips'), { method: 'POST', body: JSON.stringify(data) }),
  updateTrip: (organizationId: string, tripId: string, data: Partial<OrgTripEssentials> & { expectedUpdatedAt: string }) =>
    request<OrgTripDetail>(orgPath(organizationId, `/tourism/trips/${encodeURIComponent(tripId)}`), { method: 'PUT', body: JSON.stringify(data) }),
  // Só a própria viagem, e só enquanto rascunho: o servidor recusa (404) se
  // já não existir mais nesse estado, e recusa (409/400) se houver reserva,
  // interessado, visita ou memória associada (ver organizationTripRoutes.ts).
  deleteTrip: (organizationId: string, tripId: string) =>
    request<void>(orgPath(organizationId, `/tourism/trips/${encodeURIComponent(tripId)}`), { method: 'DELETE' }),

  leads: (organizationId: string, params?: { page?: number; limit?: number; stage?: OrgLeadStage; followUp?: 'due' }) => {
    const query = new URLSearchParams(pageQuery(params));
    if (params?.stage) query.set('stage', params.stage);
    if (params?.followUp) query.set('followUp', params.followUp);
    return request<ListResult<OrgLead>>(`${orgPath(organizationId, '/tourism/leads')}?${query}`);
  },
  lead: (organizationId: string, leadId: string) =>
    request<OrgLead>(orgPath(organizationId, `/tourism/leads/${encodeURIComponent(leadId)}`)),
  createLead: (organizationId: string, data: OrgLeadEssentials) =>
    request<OrgLead>(orgPath(organizationId, '/tourism/leads'), { method: 'POST', body: JSON.stringify(data) }),
  updateLead: (organizationId: string, leadId: string, data: Partial<OrgLeadEssentials> & { expectedUpdatedAt: string }) =>
    request<OrgLead>(orgPath(organizationId, `/tourism/leads/${encodeURIComponent(leadId)}`), { method: 'PUT', body: JSON.stringify(data) }),

  reservations: (organizationId: string, params?: { page?: number; limit?: number }) =>
    request<ListResult<OrgReservation>>(`${orgPath(organizationId, '/tourism/reservations')}?${pageQuery(params)}`),
  reservation: (organizationId: string, reservationId: string) =>
    request<OrgReservation>(orgPath(organizationId, `/tourism/reservations/${encodeURIComponent(reservationId)}`)),
  createReservation: (organizationId: string, data: OrgReservationEssentials & { tripId: string }) =>
    request<OrgReservation>(orgPath(organizationId, '/tourism/reservations'), { method: 'POST', body: JSON.stringify(data) }),
  updateReservation: (organizationId: string, reservationId: string, data: Partial<OrgReservationEssentials> & { status?: OrgReservationStatus; expectedUpdatedAt: string }) =>
    request<OrgReservation>(orgPath(organizationId, `/tourism/reservations/${encodeURIComponent(reservationId)}`), { method: 'PUT', body: JSON.stringify(data) }),

  createInstallment: (organizationId: string, reservationId: string, data: OrgInstallmentEssentials & { expectedUpdatedAt: string }) =>
    request<OrgReservation>(orgPath(organizationId, `/tourism/reservations/${encodeURIComponent(reservationId)}/installments`), { method: 'POST', body: JSON.stringify(data) }),
  updateInstallment: (organizationId: string, reservationId: string, installmentId: string, data: Partial<OrgInstallmentEssentials> & { paid?: boolean; expectedUpdatedAt: string }) =>
    request<OrgReservation>(orgPath(organizationId, `/tourism/reservations/${encodeURIComponent(reservationId)}/installments/${encodeURIComponent(installmentId)}`), { method: 'PUT', body: JSON.stringify(data) }),
  deleteInstallment: (organizationId: string, reservationId: string, installmentId: string, data: { expectedUpdatedAt: string }) =>
    request<OrgReservation>(orgPath(organizationId, `/tourism/reservations/${encodeURIComponent(reservationId)}/installments/${encodeURIComponent(installmentId)}`), { method: 'DELETE', body: JSON.stringify(data) }),
  reservationAudit: (organizationId: string, reservationId: string, params?: { page?: number; limit?: number }, options?: { signal?: AbortSignal }) =>
    request<ListResult<OrgReservationAuditEntry>>(`${orgPath(organizationId, `/tourism/reservations/${encodeURIComponent(reservationId)}/audit`)}?${pageQuery(params)}`, { signal: options?.signal }),
};
