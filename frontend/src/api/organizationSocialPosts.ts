import { request } from './index';
import type { SocialInput, SocialPost } from './socialPosts';

// Mesmo formato da API legada (socialPosts.ts), só que por empresa: usado
// por SocialPosts.tsx via o adaptador escolhido em tempo de render (ver
// buildSocialPostsAdapter), para reaproveitar a mesma interface sem
// duplicá-la nem hardcodar os caminhos globais.
const base = (organizationId: string) => `/organizations/${encodeURIComponent(organizationId)}/tourism/social-posts`;
const mediaBase = (organizationId: string) => `/organizations/${encodeURIComponent(organizationId)}/tourism/social-media`;
const path = (organizationId: string, id: string) => `${base(organizationId)}/${encodeURIComponent(id)}`;

export const createOrganizationSocialPostsApi = (organizationId: string) => ({
  list: (page: number) => request<{ data: SocialPost[]; pagination: { page: number; totalPages: number } }>(`${base(organizationId)}?page=${page}&limit=20`),
  create: (input: SocialInput) => request<SocialPost>(base(organizationId), { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: SocialInput & { version: number }) => request<SocialPost>(path(organizationId, id), { method: 'PUT', body: JSON.stringify(input) }),
  approve: (id: string, version: number) => request<SocialPost>(`${path(organizationId, id)}/approve`, { method: 'POST', body: JSON.stringify({ version }) }),
  remove: (id: string, version: number) => request<void>(path(organizationId, id), { method: 'DELETE', body: JSON.stringify({ version }) }),
  uploadImage: async (file: File): Promise<{ id: string }> => {
    const response = await fetch(`/api${mediaBase(organizationId)}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type }, body: file,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || 'Não foi possível enviar a imagem.');
    }
    return response.json();
  },
  imageUrl: (id: string) => `/api${mediaBase(organizationId)}/${encodeURIComponent(id)}`,
});
