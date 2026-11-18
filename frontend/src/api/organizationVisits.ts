import { request } from './index';
import type { ListResult } from './organizations';

export interface OrganizationVisit {
  id: string; title: string; description: string | null; date: string | null;
  city: string; region: string; lat: number | null; lng: number | null; needsReview: boolean;
}

export function listOrganizationVisits(organizationId: string, filters: { page: number; limit: number; search?: string; needsReview?: string; hasCoords?: string }): Promise<ListResult<OrganizationVisit>> {
  const query = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
  if (filters.search) query.set('search', filters.search);
  if (filters.needsReview) query.set('needsReview', filters.needsReview);
  if (filters.hasCoords) query.set('hasCoords', filters.hasCoords);
  return request(`/organizations/${encodeURIComponent(organizationId)}/tourism/visits?${query}`);
}
