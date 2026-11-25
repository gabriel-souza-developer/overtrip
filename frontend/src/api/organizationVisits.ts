import { request } from './index';
import type { ListResult } from './organizations';

// `src` é o caminho canônico a reenviar ao salvar sem trocar a foto;
// `previewSrc` é a rota de leitura autenticada por empresa, para exibir a
// miniatura mesmo fora de PUBLIC_SITE_ORGANIZATION_IDS — usar nos `<img>`.
export interface OrganizationVisit {
  id: string; title: string; description: string | null; date: string | null;
  city: string; region: string; lat: number | null; lng: number | null; needsReview: boolean;
  images: Array<{ src: string; previewSrc: string; alt: string }>; canEdit: boolean; updatedAt: string;
}
// Só os dados essenciais aceitos pela rota: nunca organizationId, tripId,
// storedIdentity, source ou needsReview — o servidor deriva/gera o resto.
export interface OrganizationVisitEssentials {
  title: string; description?: string | null; date?: string | null; city: string; region: string;
  lat?: number | null; lng?: number | null; images?: Array<{ src: string; alt: string }>;
}

const visitsPath = (organizationId: string, suffix = '') => `/organizations/${encodeURIComponent(organizationId)}/tourism/visits${suffix}`;

export function listOrganizationVisits(organizationId: string, filters: { page: number; limit: number; search?: string; needsReview?: string; hasCoords?: string }): Promise<ListResult<OrganizationVisit>> {
  const query = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
  if (filters.search) query.set('search', filters.search);
  if (filters.needsReview) query.set('needsReview', filters.needsReview);
  if (filters.hasCoords) query.set('hasCoords', filters.hasCoords);
  return request(`${visitsPath(organizationId)}?${query}`);
}

export const createOrganizationVisit = (organizationId: string, data: OrganizationVisitEssentials) =>
  request<OrganizationVisit>(visitsPath(organizationId), { method: 'POST', body: JSON.stringify(data) });

export const updateOrganizationVisit = (organizationId: string, visitId: string, data: Partial<OrganizationVisitEssentials> & { expectedUpdatedAt: string }) =>
  request<OrganizationVisit>(visitsPath(organizationId, `/${encodeURIComponent(visitId)}`), { method: 'PUT', body: JSON.stringify(data) });

// Recusa (404) um destino importado do acervo legado (source != 'manual'),
// e (400/409) um destino ainda referenciado por uma memória da galeria —
// ver organizationVisitRoutes.ts.
export const deleteOrganizationVisit = (organizationId: string, visitId: string) =>
  request<void>(visitsPath(organizationId, `/${encodeURIComponent(visitId)}`), { method: 'DELETE' });
