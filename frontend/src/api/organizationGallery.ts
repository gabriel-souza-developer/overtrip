import { request } from './index';
import type { ListResult } from './organizations';

export interface OrganizationGalleryEntry {
  id: string; title: string; date: string; dateDisplay: string; description: string;
  isFeatured: boolean; images: Array<{ src: string; alt: string }>;
}

export function listOrganizationGallery(organizationId: string, filters: { page: number; limit: number; search?: string; isFeatured?: string }): Promise<ListResult<OrganizationGalleryEntry>> {
  const query = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
  if (filters.search) query.set('search', filters.search);
  if (filters.isFeatured) query.set('isFeatured', filters.isFeatured);
  return request(`/organizations/${encodeURIComponent(organizationId)}/tourism/gallery?${query}`);
}
