import { z } from 'zod';
import { isValidImageSrc, IMAGE_SRC_MESSAGE } from './imageSrc.js';

export const imageSrcSchema = z.string().refine(isValidImageSrc, { message: IMAGE_SRC_MESSAGE });

// Trip schemas
export const tripCreateSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  headlineDisplay: z.string().optional().nullable(),
  category: z.string().min(1, 'Categoria é obrigatória'),
  description: z.string().min(1, 'Descrição é obrigatória'),
  city: z.string().min(1, 'Cidade é obrigatória'),
  region: z.string().min(1, 'Região é obrigatória'),
  startDateISO: z.string().datetime({ offset: true, message: 'Data de início inválida (ISO 8601 com timezone)' }),
  endDateISO: z.string().datetime({ offset: true, message: 'Data de fim inválida (ISO 8601 com timezone)' }).optional().nullable(),
  departureTime: z.string().optional().nullable(),
  departureTolerance: z.string().optional().nullable(),
  returnTime: z.string().optional().nullable(),
  scheduleInfo: z.string().optional().nullable(),
  scheduleTBD: z.boolean().default(false),
  priceValue: z.number().optional().nullable(),
  priceDisplay: z.string().optional().nullable(),
  priceUnit: z.string().default('por pessoa'),
  free: z.boolean().default(false),
  intensityClass: z.enum(['leve', 'moderado', 'intenso', 'extremo']).default('moderado'),
  spotsLeft: z.number().int().optional().nullable(),
  trailDistance: z.string().optional().nullable(),
  supportPoint: z.string().optional().nullable(),
  supportPointInfo: z.string().optional().nullable(),
  meetingCity: z.string().optional().nullable(),
  meetingPoint: z.string().optional().nullable(),
  meetingDetails: z.string().optional().nullable(),
  meetingMapsQuery: z.string().optional().nullable(),
  includes: z.array(z.string()).default([]),
  includesHighlight: z.string().optional().nullable(),
  includedServices: z.array(z.string()).optional().nullable(),
  itinerary: z.array(z.string()).optional().nullable(),
  routeNotes: z.array(z.string()).optional().nullable(),
  importantInfo: z.array(z.string()).optional().nullable(),
  media: z.array(z.object({
    src: imageSrcSchema,
    alt: z.string(),
    focus: z.string().optional(),
    type: z.enum(['image', 'video']).optional(),
  })).default([]),
  buttonLabel: z.string().default('Quero viajar'),
  buttonClass: z.string().default('button-dark'),
  status: z.enum(['DRAFT', 'OPEN', 'COMPLETED', 'CANCELLED', 'SOLD_OUT', 'CLOSED']).default('DRAFT'),
  availabilitySchema: z.string().url().default('https://schema.org/InStock'),
  storedIdentity: z.string().optional(),
  departures: z.array(z.object({
    time: z.string(),
    place: z.string(),
    city: z.string(),
    mapsUrl: z.string().url().optional().nullable(),
    mapsQuery: z.string().optional().nullable(),
    orderIndex: z.number().int(),
  })).optional().default([]),
});

export const tripUpdateSchema = tripCreateSchema.partial();

export const tripQuerySchema = z.object({
  status: z.enum(['DRAFT', 'OPEN', 'COMPLETED', 'CANCELLED', 'SOLD_OUT', 'CLOSED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});

// Visit schemas
export const visitCreateSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional().nullable(),
  date: z.string().datetime({ offset: true, message: 'Data inválida (ISO 8601 com timezone)' }).optional().nullable(),
  city: z.string().min(1, 'Cidade é obrigatória'),
  region: z.string().min(1, 'Região é obrigatória'),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  images: z.array(z.object({
    src: imageSrcSchema,
    alt: z.string(),
  })).optional().nullable(),
  tripId: z.string().cuid().optional().nullable(),
  needsReview: z.boolean().default(true),
  notes: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  storedIdentity: z.string().optional(),
});

export const visitUpdateSchema = visitCreateSchema.partial();

export const visitQuerySchema = z.object({
  needsReview: z.coerce.boolean().optional(),
  tripId: z.string().cuid().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  hasCoords: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});

// GalleryEntry schemas
export const galleryCreateSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  date: z.string().datetime({ offset: true, message: 'Data inválida (ISO 8601 com timezone)' }),
  dateDisplay: z.string().min(1, 'Data de exibição é obrigatória'),
  description: z.string().min(1, 'Descrição é obrigatória'),
  images: z.array(z.object({
    src: imageSrcSchema,
    alt: z.string(),
  })).min(1, 'Pelo menos uma imagem é obrigatória'),
  tripId: z.string().cuid().optional().nullable(),
  visitId: z.string().cuid().optional().nullable(),
  isFeatured: z.boolean().default(false),
  orderIndex: z.number().int().default(0),
  storedIdentity: z.string().optional(),
});

export const galleryUpdateSchema = galleryCreateSchema.partial();

export const galleryQuerySchema = z.object({
  isFeatured: z.coerce.boolean().optional(),
  tripId: z.string().cuid().optional(),
  visitId: z.string().cuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});

// Dashboard schemas
export const dashboardStatsSchema = z.object({
  tripsTotal: z.number().int(),
  tripsPublished: z.number().int(),
  tripsDraft: z.number().int(),
  visitsTotal: z.number().int(),
  visitsNeedsReview: z.number().int(),
  visitsWithCoords: z.number().int(),
  galleryTotal: z.number().int(),
  galleryFeatured: z.number().int(),
});

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6, 'Nova senha deve ter pelo menos 6 caracteres'),
});

// Type exports
export type TripCreateInput = z.infer<typeof tripCreateSchema>;
export type TripUpdateInput = z.infer<typeof tripUpdateSchema>;
export type TripQueryInput = z.infer<typeof tripQuerySchema>;
export type VisitCreateInput = z.infer<typeof visitCreateSchema>;
export type VisitUpdateInput = z.infer<typeof visitUpdateSchema>;
export type VisitQueryInput = z.infer<typeof visitQuerySchema>;
export type GalleryCreateInput = z.infer<typeof galleryCreateSchema>;
export type GalleryUpdateInput = z.infer<typeof galleryUpdateSchema>;
export type GalleryQueryInput = z.infer<typeof galleryQuerySchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;