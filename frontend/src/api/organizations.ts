import { request } from './index';

export interface OrganizationSummary { id: string; name: string; slug: string; role: string }
export interface OrganizationContext { organization: { id: string; name: string; slug: string; status: string }; role: string }

export type OrgTripStatus = 'DRAFT' | 'REVIEW' | 'OPEN' | 'COMPLETED' | 'CANCELLED' | 'SOLD_OUT' | 'CLOSED';
export interface OrgTrip {
  id: string; title: string; category: string; description: string; city: string; region: string; updatedAt: string;
  startDateISO: string; endDateISO: string | null; status: OrgTripStatus;
}
// Só os dados essenciais aceitos pela rota: nunca organizationId, status,
// mídia ou storedIdentity — o servidor deriva/gera tudo isso por conta própria.
export interface OrgTripEssentials {
  title: string; category: string; description: string; city: string; region: string;
  startDateISO: string; endDateISO?: string | null;
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
export interface OrganizationDashboardSummary { trips: { total: number; upcoming: number; open: number; drafts: number }; leads?: number; reservations?: number }

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
  dashboard: (organizationId: string) => request<OrganizationDashboardSummary>(orgPath(organizationId, '/tourism/dashboard')),

  trips: (organizationId: string, params?: { page?: number; limit?: number; search?: string; status?: string; period?: 'upcoming' | 'past' }) =>
    request<ListResult<OrgTrip>>(`${orgPath(organizationId, '/tourism/trips')}?${pageQuery(params)}`),
  trip: (organizationId: string, tripId: string) =>
    request<OrgTrip>(orgPath(organizationId, `/tourism/trips/${encodeURIComponent(tripId)}`)),
  createTrip: (organizationId: string, data: OrgTripEssentials) =>
    request<OrgTrip>(orgPath(organizationId, '/tourism/trips'), { method: 'POST', body: JSON.stringify(data) }),
  updateTrip: (organizationId: string, tripId: string, data: Partial<OrgTripEssentials> & { expectedUpdatedAt: string }) =>
    request<OrgTrip>(orgPath(organizationId, `/tourism/trips/${encodeURIComponent(tripId)}`), { method: 'PUT', body: JSON.stringify(data) }),

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
};
