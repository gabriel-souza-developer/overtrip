import { request } from './index';

export type SocialPlatform = 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK';
export type SocialVariant = { platform: SocialPlatform; caption: string; socialMediaId?: string | null };
export type SocialPost = { id: string; title: string; variants: SocialVariant[]; approvedAt: string | null; version: number; createdAt: string; updatedAt: string };
export type SocialInput = { title: string; variants: SocialVariant[] };
const base = '/social-posts';
const path = (id: string) => `${base}/${encodeURIComponent(id)}`;
export const socialPostsApi = {
  list: (page: number) => request<{ data: SocialPost[]; pagination: { page: number; totalPages: number } }>(`${base}?page=${page}&limit=20`),
  create: (input: SocialInput) => request<SocialPost>(base, { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: SocialInput & { version: number }) => request<SocialPost>(path(id), { method: 'PUT', body: JSON.stringify(input) }),
  approve: (id: string, version: number) => request<SocialPost>(`${path(id)}/approve`, { method: 'POST', body: JSON.stringify({ version }) }),
  remove: (id: string, version: number) => request<void>(path(id), { method: 'DELETE', body: JSON.stringify({ version }) }),
  uploadImage: async (file: File): Promise<{ id: string }> => {
    const response = await fetch('/api/social-media', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type }, body: file,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || 'Não foi possível enviar a imagem.');
    }
    return response.json();
  },
  imageUrl: (id: string) => `/api/social-media/${encodeURIComponent(id)}`,
};
