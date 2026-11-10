export type LeadStage = 'NEW' | 'CONTACTED' | 'NEGOTIATING' | 'WON' | 'LOST';
export interface Lead {
  id: string; name: string; phone: string | null; email: string | null; stage: LeadStage;
  tripId: string | null; trip: { id: string; title: string } | null; responsible: string | null;
  nextFollowUpAt: string | null; notes: string | null; createdAt: string; updatedAt: string;
  events?: { id: string; body: string; createdAt: string }[];
}
export type LeadInput = Pick<Lead, 'name' | 'phone' | 'email' | 'stage' | 'tripId' | 'responsible' | 'nextFollowUpAt' | 'notes'>;
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`/api/leads${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Não foi possível concluir a operação.');
  }
  return res.status === 204 ? undefined as T : res.json();
}
export const leadsApi = {
  list: (stage: string, page: number) => request<{ data: Lead[]; pagination: { page: number; totalPages: number; total: number } }>(`?${new URLSearchParams({ page: String(page), limit: '20', ...(stage ? { stage } : {}) })}`),
  get: (id: string) => request<Lead>(`/${encodeURIComponent(id)}`),
  create: (data: LeadInput) => request<Lead>('', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: LeadInput) => request<Lead>(`/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  addEvent: (id: string, body: string) => request(`/${encodeURIComponent(id)}/events`, { method: 'POST', body: JSON.stringify({ body }) }),
  remove: (id: string) => request<void>(`/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
