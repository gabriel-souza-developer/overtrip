import { translateApiError } from '../lib/formHelpers';
import type { SystemHealth } from '../lib/systemHealth';

const API_BASE = '/api';

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export interface KnowledgeEntry { question: string; answer: string }
export interface KnowledgeVersion { version: number; entries: KnowledgeEntry[]; approvedById: string; approvedAt: string }
export type KnowledgeVersionSummary = Omit<KnowledgeVersion, 'entries'>;

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('auth_token');
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 401 && error.code === 'SESSION_INVALID' && token && token === localStorage.getItem('auth_token')) {
      window.dispatchEvent(new Event('overtrip:session-ended'));
    }
    throw new ApiRequestError(translateApiError(error), response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export const authApi = {
  login: async (email: string, password: string) => {
    const data = await request<{ token: string; user: { id: string; email: string; name: string; role: string } }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) }
    );
    return data;
  },

  me: async () => {
    return request<{ id: string; email: string; name: string; role: string }>('/auth/me');
  },

  logout: async () => request<void>('/auth/logout', { method: 'POST' }),

  changePassword: async (currentPassword: string, newPassword: string) => {
    return request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
};

export const knowledgeApi = {
  current: () => request<KnowledgeVersion | null>('/assistant-knowledge'),
  versions: () => request<KnowledgeVersionSummary[]>('/assistant-knowledge/versions'),
  version: (version: number) => request<KnowledgeVersion>(`/assistant-knowledge/versions/${version}`),
  approve: (entries: KnowledgeEntry[], expectedVersion: number | null) => request<KnowledgeVersion>('/assistant-knowledge', {
    method: 'POST', body: JSON.stringify({ entries, expectedVersion }),
  }),
};

export const tripApi = {
  list: (params?: Record<string, string | number | boolean>) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') searchParams.set(key, String(value));
      });
    }
    return request<{ data: Trip[]; pagination: Pagination }>(`/trips?${searchParams}`);
  },

  get: (id: string) => request<Trip>(`/trips/${id}`),

  create: (data: TripFormData) => request<Trip>('/trips', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Partial<TripFormData>) => request<Trip>(`/trips/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) => request(`/trips/${id}`, { method: 'DELETE' }),

  publish: (id: string) => request<Trip>(`/trips/${id}/publish`, { method: 'POST' }),

  unpublish: (id: string) => request<Trip>(`/trips/${id}/unpublish`, { method: 'POST' }),
};

export interface TripDocument {
  id: string; originalFilename: string; sizeBytes: number; retentionUntil: string;
  extractionStatus: string;
}
export interface DocumentSuggestions {
  draft: Record<string, string | number | boolean | string[]>;
  warnings: string[];
  sources: Record<string, { documentId: string; filename: string; page: number; excerpt: string }>;
}
const documentUrl = (tripId: string, documentId = '') => `/trips/${encodeURIComponent(tripId)}/documents${documentId ? `/${encodeURIComponent(documentId)}` : ''}`;
export const documentApi = {
  list: (tripId: string) => request<TripDocument[]>(documentUrl(tripId)),
  upload: (tripId: string, file: File) => request<TripDocument>(documentUrl(tripId), {
    method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-Document-Filename': encodeURIComponent(file.name) }, body: file,
  }),
  remove: (tripId: string, id: string) => request<void>(documentUrl(tripId, id), { method: 'DELETE' }),
  suggestions: (tripId: string, id: string) => request<DocumentSuggestions>(`${documentUrl(tripId, id)}/suggestions`, { method: 'POST' }),
  download: async (tripId: string, doc: TripDocument) => {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${API_BASE}${documentUrl(tripId, doc.id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error('Não foi possível baixar o documento.');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = doc.originalFilename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

export const aiApi = {
  status: () => request<{ enabled: boolean }>('/ai/status'),

  tripDraft: (text: string) =>
    request<{ draft: Record<string, string | number | boolean | string[]>; warnings: string[] }>(
      '/ai/trip-draft',
      { method: 'POST', body: JSON.stringify({ text }) }
    ),
};

export const visitApi = {
  list: (params?: Record<string, string | number | boolean>) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') searchParams.set(key, String(value));
      });
    }
    return request<{ data: Visit[]; pagination: Pagination }>(`/visits?${searchParams}`);
  },

  get: (id: string) => request<Visit>(`/visits/${id}`),

  create: (data: VisitFormData) => request<Visit>('/visits', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Partial<VisitFormData>) => request<Visit>(`/visits/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) => request(`/visits/${id}`, { method: 'DELETE' }),

  associate: (id: string, tripId: string | null) => request<Visit>(`/visits/${id}/associate`, {
    method: 'POST',
    body: JSON.stringify({ tripId }),
  }),
};

export const galleryApi = {
  list: (params?: Record<string, string | number | boolean>) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') searchParams.set(key, String(value));
      });
    }
    return request<{ data: GalleryEntry[]; pagination: Pagination }>(`/gallery?${searchParams}`);
  },

  get: (id: string) => request<GalleryEntry>(`/gallery/${id}`),

  create: (data: GalleryFormData) => request<GalleryEntry>('/gallery', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Partial<GalleryFormData>) => request<GalleryEntry>(`/gallery/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) => request(`/gallery/${id}`, { method: 'DELETE' }),

  reorder: (entries: { id: string; orderIndex: number }[]) => request('/gallery/reorder', { method: 'POST', body: JSON.stringify({ entries }) }),
};

export const dashboardApi = {
  stats: () => request<DashboardStats>('/dashboard/stats'),
};

export const systemApi = {
  health: () => request<SystemHealth>('/system/health'),
};

export const settingsApi = {
  getWhatsapp: () => request<{ defaultWhatsapp: string | null }>('/settings/whatsapp'),
  updateWhatsapp: (defaultWhatsapp: string) => request<{ defaultWhatsapp: string }>('/settings/whatsapp', {
    method: 'PUT', body: JSON.stringify({ defaultWhatsapp }),
  }),
  getTripPresentation: () => request<TripPresentationDefaults>('/settings/trip-presentation'),
  updateTripPresentation: (defaults: TripPresentationDefaults) => request<TripPresentationDefaults>('/settings/trip-presentation', {
    method: 'PUT', body: JSON.stringify(defaults),
  }),
};

export interface TripPresentationDefaults {
  buttonLabel: string;
  buttonClass: 'button-dark' | 'button-rust' | 'button-light' | 'button-outline';
  priceUnit: string;
}

// Types
export interface Trip {
  id: string;
  title: string;
  headlineDisplay: string | null;
  category: string;
  description: string;
  city: string;
  region: string;
  startDateISO: string;
  endDateISO: string | null;
  departureTime: string | null;
  departureTolerance: string | null;
  returnTime: string | null;
  scheduleInfo: string | null;
  scheduleTBD: boolean;
  priceValue: number | null;
  priceDisplay: string | null;
  priceUnit: string;
  free: boolean;
  intensityClass: string;
  spotsLeft: number | null;
  trailDistance: string | null;
  supportPoint: string | null;
  supportPointInfo: string | null;
  meetingCity: string | null;
  meetingPoint: string | null;
  meetingTBD: boolean;
  meetingDetails: string | null;
  meetingMapsQuery: string | null;
  includes: string[];
  includesHighlight: string | null;
  includedServices: string[] | null;
  itinerary: string[] | null;
  routeNotes: string[] | null;
  importantInfo: string[] | null;
  media: Array<{ src: string; alt: string; focus?: string; type?: 'image' | 'video' }>;
  buttonLabel: string;
  buttonClass: string;
  status: TripStatus;
  availabilitySchema: string;
  storedIdentity: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  departures?: TripDeparture[];
  _count?: { visits: number; galleryEntries: number };
}

export interface TripDeparture {
  id: string;
  tripId: string;
  time: string;
  place: string;
  city: string;
  mapsUrl: string | null;
  mapsQuery: string | null;
  orderIndex: number;
}

export type TripStatus = 'DRAFT' | 'REVIEW' | 'OPEN' | 'COMPLETED' | 'CANCELLED' | 'SOLD_OUT' | 'CLOSED';

export interface TripFormData {
  title: string;
  headlineDisplay?: string | null;
  category: string;
  description: string;
  city: string;
  region: string;
  startDateISO: string;
  endDateISO?: string | null;
  departureTime?: string | null;
  departureTolerance?: string | null;
  returnTime?: string | null;
  scheduleInfo?: string | null;
  scheduleTBD?: boolean;
  priceValue?: number | null;
  priceDisplay?: string | null;
  priceUnit?: string;
  free?: boolean;
  intensityClass?: 'leve' | 'moderado' | 'intenso' | 'extremo';
  spotsLeft?: number | null;
  trailDistance?: string | null;
  supportPoint?: string | null;
  supportPointInfo?: string | null;
  meetingCity?: string | null;
  meetingPoint?: string | null;
  meetingTBD?: boolean;
  meetingDetails?: string | null;
  meetingMapsQuery?: string | null;
  includes?: string[];
  includesHighlight?: string | null;
  includedServices?: string[] | null;
  itinerary?: string[] | null;
  routeNotes?: string[] | null;
  importantInfo?: string[] | null;
  media?: Array<{ src: string; alt: string; focus?: string; type?: 'image' | 'video' }>;
  buttonLabel?: string;
  buttonClass?: string;
  status?: TripStatus;
  availabilitySchema?: string;
  departures?: Array<{ time: string; place: string; city: string; mapsUrl?: string | null; mapsQuery?: string | null; orderIndex: number }>;
}

export interface Visit {
  id: string;
  tripId: string | null;
  title: string;
  description: string | null;
  date: string | null;
  city: string;
  region: string;
  lat: number | null;
  lng: number | null;
  images: Array<{ src: string; alt: string }> | null;
  storedIdentity: string;
  source: string | null;
  needsReview: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  trip?: { id: string; title: string; status: TripStatus } | null;
  galleryEntries?: Array<{ id: string; title: string }>;
  _count?: { galleryEntries: number };
}

export interface VisitFormData {
  title: string;
  description?: string | null;
  date?: string | null;
  city: string;
  region: string;
  lat?: number | null;
  lng?: number | null;
  images?: Array<{ src: string; alt: string }> | null;
  tripId?: string | null;
  needsReview?: boolean;
  notes?: string | null;
}

export interface GalleryEntry {
  id: string;
  title: string;
  date: string;
  dateDisplay: string;
  description: string;
  images: Array<{ src: string; alt: string }>;
  tripId: string | null;
  visitId: string | null;
  isFeatured: boolean;
  orderIndex: number;
  storedIdentity: string;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  trip?: { id: string; title: string } | null;
  visit?: { id: string; title: string } | null;
}

export interface GalleryFormData {
  title: string;
  date: string;
  dateDisplay: string;
  description: string;
  images: Array<{ src: string; alt: string }>;
  tripId?: string | null;
  visitId?: string | null;
  isFeatured?: boolean;
  orderIndex?: number;
}

export interface DashboardStats {
  tripsTotal: number;
  tripsPublished: number;
  tripsDraft: number;
  visitsTotal: number;
  visitsNeedsReview: number;
  visitsWithCoords: number;
  galleryTotal: number;
  galleryFeatured: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
