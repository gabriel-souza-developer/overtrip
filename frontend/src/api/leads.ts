import { request } from './index';

export type LeadStage = 'NEW' | 'CONTACTED' | 'NEGOTIATING' | 'WON' | 'LOST';
export interface Lead {
  id: string; name: string; phone: string | null; email: string | null; stage: LeadStage;
  tripId: string | null; trip: { id: string; title: string } | null; responsible: string | null;
  nextFollowUpAt: string | null; notes: string | null; createdAt: string; updatedAt: string;
  events?: { id: string; body: string; createdAt: string }[];
}
export type LeadInput = Pick<Lead, 'name' | 'phone' | 'email' | 'stage' | 'tripId' | 'responsible' | 'nextFollowUpAt' | 'notes'>;
const leadRequest = <T>(path: string, options: RequestInit = {}) => request<T>(`/leads${path}`, options);
export const leadsApi = {
  list: (stage: string, page: number, limit = 20, followUp = '') => leadRequest<{ data: Lead[]; pagination: { page: number; totalPages: number; total: number } }>(`?${new URLSearchParams({ page: String(page), limit: String(limit), ...(stage ? { stage } : {}), ...(followUp ? { followUp } : {}) })}`),
  get: (id: string) => leadRequest<Lead>(`/${encodeURIComponent(id)}`),
  create: (data: LeadInput) => leadRequest<Lead>('', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: LeadInput) => leadRequest<Lead>(`/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  addEvent: (id: string, body: string) => leadRequest(`/${encodeURIComponent(id)}/events`, { method: 'POST', body: JSON.stringify({ body }) }),
  remove: (id: string) => leadRequest<void>(`/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
