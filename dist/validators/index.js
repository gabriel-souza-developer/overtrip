"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePasswordSchema = exports.loginSchema = exports.dashboardStatsSchema = exports.galleryQuerySchema = exports.galleryUpdateSchema = exports.galleryCreateSchema = exports.visitQuerySchema = exports.visitUpdateSchema = exports.visitCreateSchema = exports.tripQuerySchema = exports.tripUpdateSchema = exports.tripCreateSchema = void 0;
const zod_1 = require("zod");
// Trip schemas
exports.tripCreateSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'Título é obrigatório'),
    headlineDisplay: zod_1.z.string().optional().nullable(),
    category: zod_1.z.string().min(1, 'Categoria é obrigatória'),
    description: zod_1.z.string().min(1, 'Descrição é obrigatória'),
    city: zod_1.z.string().min(1, 'Cidade é obrigatória'),
    region: zod_1.z.string().min(1, 'Região é obrigatória'),
    startDateISO: zod_1.z.string().datetime({ offset: true, message: 'Data de início inválida (ISO 8601 com timezone)' }),
    endDateISO: zod_1.z.string().datetime({ offset: true, message: 'Data de fim inválida (ISO 8601 com timezone)' }).optional().nullable(),
    departureTime: zod_1.z.string().optional().nullable(),
    departureTolerance: zod_1.z.string().optional().nullable(),
    returnTime: zod_1.z.string().optional().nullable(),
    scheduleInfo: zod_1.z.string().optional().nullable(),
    scheduleTBD: zod_1.z.boolean().default(false),
    priceValue: zod_1.z.number().optional().nullable(),
    priceDisplay: zod_1.z.string().optional().nullable(),
    priceUnit: zod_1.z.string().default('por pessoa'),
    free: zod_1.z.boolean().default(false),
    intensityClass: zod_1.z.enum(['leve', 'moderado', 'intenso', 'extremo']).default('moderado'),
    spotsLeft: zod_1.z.number().int().optional().nullable(),
    trailDistance: zod_1.z.string().optional().nullable(),
    supportPoint: zod_1.z.string().optional().nullable(),
    supportPointInfo: zod_1.z.string().optional().nullable(),
    meetingCity: zod_1.z.string().optional().nullable(),
    meetingPoint: zod_1.z.string().optional().nullable(),
    meetingDetails: zod_1.z.string().optional().nullable(),
    meetingMapsQuery: zod_1.z.string().optional().nullable(),
    includes: zod_1.z.array(zod_1.z.string()).default([]),
    includesHighlight: zod_1.z.string().optional().nullable(),
    includedServices: zod_1.z.array(zod_1.z.string()).optional().nullable(),
    itinerary: zod_1.z.array(zod_1.z.string()).optional().nullable(),
    routeNotes: zod_1.z.array(zod_1.z.string()).optional().nullable(),
    importantInfo: zod_1.z.array(zod_1.z.string()).optional().nullable(),
    media: zod_1.z.array(zod_1.z.object({
        src: zod_1.z.string().url('URL de imagem inválida'),
        alt: zod_1.z.string(),
        focus: zod_1.z.string().optional(),
        type: zod_1.z.enum(['image', 'video']).optional(),
    })).default([]),
    buttonLabel: zod_1.z.string().default('Quero viajar'),
    buttonClass: zod_1.z.string().default('button-dark'),
    status: zod_1.z.enum(['DRAFT', 'OPEN', 'COMPLETED', 'CANCELLED', 'SOLD_OUT', 'CLOSED']).default('DRAFT'),
    availabilitySchema: zod_1.z.string().url().default('https://schema.org/InStock'),
    storedIdentity: zod_1.z.string().optional(),
    departures: zod_1.z.array(zod_1.z.object({
        time: zod_1.z.string(),
        place: zod_1.z.string(),
        city: zod_1.z.string(),
        mapsUrl: zod_1.z.string().url().optional().nullable(),
        mapsQuery: zod_1.z.string().optional().nullable(),
        orderIndex: zod_1.z.number().int(),
    })).optional().default([]),
});
exports.tripUpdateSchema = exports.tripCreateSchema.partial();
exports.tripQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(['DRAFT', 'OPEN', 'COMPLETED', 'CANCELLED', 'SOLD_OUT', 'CLOSED']).optional(),
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(100).default(20),
    search: zod_1.z.string().optional(),
});
// Visit schemas
exports.visitCreateSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'Título é obrigatório'),
    description: zod_1.z.string().optional().nullable(),
    date: zod_1.z.string().datetime({ offset: true, message: 'Data inválida (ISO 8601 com timezone)' }).optional().nullable(),
    city: zod_1.z.string().min(1, 'Cidade é obrigatória'),
    region: zod_1.z.string().min(1, 'Região é obrigatória'),
    lat: zod_1.z.number().min(-90).max(90).optional().nullable(),
    lng: zod_1.z.number().min(-180).max(180).optional().nullable(),
    images: zod_1.z.array(zod_1.z.object({
        src: zod_1.z.string().url('URL de imagem inválida'),
        alt: zod_1.z.string(),
    })).optional().nullable(),
    tripId: zod_1.z.string().cuid().optional().nullable(),
    needsReview: zod_1.z.boolean().default(true),
    notes: zod_1.z.string().optional().nullable(),
    source: zod_1.z.string().optional().nullable(),
    storedIdentity: zod_1.z.string().optional(),
});
exports.visitUpdateSchema = exports.visitCreateSchema.partial();
exports.visitQuerySchema = zod_1.z.object({
    needsReview: zod_1.z.coerce.boolean().optional(),
    tripId: zod_1.z.string().cuid().optional(),
    city: zod_1.z.string().optional(),
    region: zod_1.z.string().optional(),
    hasCoords: zod_1.z.coerce.boolean().optional(),
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(100).default(20),
    search: zod_1.z.string().optional(),
});
// GalleryEntry schemas
exports.galleryCreateSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'Título é obrigatório'),
    date: zod_1.z.string().datetime({ offset: true, message: 'Data inválida (ISO 8601 com timezone)' }),
    dateDisplay: zod_1.z.string().min(1, 'Data de exibição é obrigatória'),
    description: zod_1.z.string().min(1, 'Descrição é obrigatória'),
    images: zod_1.z.array(zod_1.z.object({
        src: zod_1.z.string().url('URL de imagem inválida'),
        alt: zod_1.z.string(),
    })).min(1, 'Pelo menos uma imagem é obrigatória'),
    tripId: zod_1.z.string().cuid().optional().nullable(),
    visitId: zod_1.z.string().cuid().optional().nullable(),
    isFeatured: zod_1.z.boolean().default(false),
    orderIndex: zod_1.z.number().int().default(0),
    storedIdentity: zod_1.z.string().optional(),
});
exports.galleryUpdateSchema = exports.galleryCreateSchema.partial();
exports.galleryQuerySchema = zod_1.z.object({
    isFeatured: zod_1.z.coerce.boolean().optional(),
    tripId: zod_1.z.string().cuid().optional(),
    visitId: zod_1.z.string().cuid().optional(),
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(100).default(20),
    search: zod_1.z.string().optional(),
});
// Dashboard schemas
exports.dashboardStatsSchema = zod_1.z.object({
    tripsTotal: zod_1.z.number().int(),
    tripsPublished: zod_1.z.number().int(),
    tripsDraft: zod_1.z.number().int(),
    visitsTotal: zod_1.z.number().int(),
    visitsNeedsReview: zod_1.z.number().int(),
    visitsWithCoords: zod_1.z.number().int(),
    galleryTotal: zod_1.z.number().int(),
    galleryFeatured: zod_1.z.number().int(),
});
// Auth schemas
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Email inválido'),
    password: zod_1.z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(6),
    newPassword: zod_1.z.string().min(6, 'Nova senha deve ter pelo menos 6 caracteres'),
});
//# sourceMappingURL=index.js.map