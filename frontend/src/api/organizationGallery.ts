import { request } from './index';
import type { ListResult } from './organizations';

// `src` é o caminho canônico a reenviar ao salvar sem trocar a foto;
// `previewSrc` é a rota de leitura autenticada por empresa, para exibir a
// miniatura mesmo fora de PUBLIC_SITE_ORGANIZATION_IDS — usar nos `<img>`.
export interface OrganizationGalleryEntry {
  id: string; title: string; date: string; dateDisplay: string; description: string;
  isFeatured: boolean; images: Array<{ src: string; previewSrc: string; alt: string }>; canEdit: boolean; updatedAt: string;
}
// Só os dados essenciais aceitos pela rota: nunca organizationId, tripId,
// visitId, storedIdentity, source, isFeatured ou orderIndex.
export interface OrganizationGalleryEssentials {
  title: string; date: string; dateDisplay: string; description: string; images: Array<{ src: string; alt: string }>;
}

const galleryPath = (organizationId: string, suffix = '') => `/organizations/${encodeURIComponent(organizationId)}/tourism/gallery${suffix}`;

export function listOrganizationGallery(organizationId: string, filters: { page: number; limit: number; search?: string; isFeatured?: string }): Promise<ListResult<OrganizationGalleryEntry>> {
  const query = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
  if (filters.search) query.set('search', filters.search);
  if (filters.isFeatured) query.set('isFeatured', filters.isFeatured);
  return request(`${galleryPath(organizationId)}?${query}`);
}

export const createOrganizationGalleryEntry = (organizationId: string, data: OrganizationGalleryEssentials) =>
  request<OrganizationGalleryEntry>(galleryPath(organizationId), { method: 'POST', body: JSON.stringify(data) });

export const updateOrganizationGalleryEntry = (organizationId: string, entryId: string, data: Partial<OrganizationGalleryEssentials> & { expectedUpdatedAt: string }) =>
  request<OrganizationGalleryEntry>(galleryPath(organizationId, `/${encodeURIComponent(entryId)}`), { method: 'PUT', body: JSON.stringify(data) });

// Recusa (404) uma memória importada do acervo legado (source != 'manual')
// — ver organizationGalleryRoutes.ts.
export const deleteOrganizationGalleryEntry = (organizationId: string, entryId: string) =>
  request<void>(galleryPath(organizationId, `/${encodeURIComponent(entryId)}`), { method: 'DELETE' });
