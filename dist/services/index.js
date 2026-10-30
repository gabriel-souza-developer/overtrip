"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardService = exports.galleryService = exports.visitService = exports.tripService = void 0;
const prisma_js_1 = require("../lib/prisma.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const searchUtils_js_1 = require("../utils/searchUtils.js");
function parseJsonFields(data, jsonFields) {
    const result = { ...data };
    for (const field of jsonFields) {
        if (result[field] && typeof result[field] === 'string') {
            try {
                result[field] = JSON.parse(result[field]);
            }
            catch {
                // Keep as string if not valid JSON
            }
        }
    }
    return result;
}
function stringifyJsonFields(data, jsonFields) {
    const result = { ...data };
    for (const field of jsonFields) {
        if (result[field] && typeof result[field] === 'object') {
            result[field] = JSON.stringify(result[field]);
        }
    }
    return result;
}
// Trip service
const TRIP_JSON_FIELDS = [
    'includes',
    'includedServices',
    'itinerary',
    'routeNotes',
    'importantInfo',
    'media',
];
exports.tripService = {
    async findAll(query) {
        const { page = 1, limit = 20, status, search } = query;
        const skip = (page - 1) * limit;
        const where = {};
        if (status) {
            where.status = status;
        }
        // Apply case/accent-insensitive search using normalized columns
        const searchClauses = (0, searchUtils_js_1.applySearchFilter)(search, ['titleSearch', 'citySearch', 'categorySearch']);
        if (searchClauses) {
            where.OR = searchClauses;
        }
        const [trips, total] = await Promise.all([
            prisma_js_1.prisma.trip.findMany({
                where,
                include: {
                    departures: { orderBy: { orderIndex: 'asc' } },
                    _count: { select: { visits: true, galleryEntries: true } },
                },
                orderBy: { startDateISO: 'desc' },
                skip,
                take: limit,
            }),
            prisma_js_1.prisma.trip.count({ where }),
        ]);
        return {
            data: trips.map(t => parseJsonFields(t, TRIP_JSON_FIELDS)),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    },
    async findById(id) {
        const trip = await prisma_js_1.prisma.trip.findUnique({
            where: { id },
            include: {
                departures: { orderBy: { orderIndex: 'asc' } },
                visits: { where: { needsReview: false } },
                galleryEntries: { where: { isFeatured: true } },
            },
        });
        if (!trip) {
            throw errorHandler_js_1.AppError.notFound('Viagem não encontrada');
        }
        return parseJsonFields(trip, TRIP_JSON_FIELDS);
    },
    async create(data) {
        const { departures, ...tripData } = data;
        // Generate storedIdentity if not provided (for manual creation)
        const storedIdentity = data.storedIdentity || `manual:${Date.now()}:${Math.random().toString(36).substring(7)}`;
        // Check if storedIdentity already exists
        const existing = await prisma_js_1.prisma.trip.findUnique({
            where: { storedIdentity },
        });
        if (existing) {
            throw errorHandler_js_1.AppError.conflict('Viagem com esta identidade já existe', { storedIdentity });
        }
        // Add normalized search columns
        const searchData = {
            titleSearch: (0, searchUtils_js_1.normalizeForSearch)(tripData.title || ''),
            citySearch: (0, searchUtils_js_1.normalizeForSearch)(tripData.city || ''),
            categorySearch: (0, searchUtils_js_1.normalizeForSearch)(tripData.category || ''),
        };
        const trip = await prisma_js_1.prisma.trip.create({
            data: {
                ...stringifyJsonFields(tripData, TRIP_JSON_FIELDS),
                ...searchData,
                storedIdentity,
                departures: departures?.length ? {
                    create: departures.map(d => ({
                        ...d,
                        mapsUrl: d.mapsUrl || null,
                        mapsQuery: d.mapsQuery || null,
                    })),
                } : undefined,
            },
            include: {
                departures: { orderBy: { orderIndex: 'asc' } },
            },
        });
        return parseJsonFields(trip, TRIP_JSON_FIELDS);
    },
    async update(id, data) {
        const { departures, ...tripData } = data;
        // Check if trip exists
        await this.findById(id);
        // Update normalized search columns if relevant fields are being updated
        const searchData = {};
        if (tripData.title !== undefined) {
            searchData.titleSearch = (0, searchUtils_js_1.normalizeForSearch)(tripData.title);
        }
        if (tripData.city !== undefined) {
            searchData.citySearch = (0, searchUtils_js_1.normalizeForSearch)(tripData.city);
        }
        if (tripData.category !== undefined) {
            searchData.categorySearch = (0, searchUtils_js_1.normalizeForSearch)(tripData.category);
        }
        // Update trip
        const trip = await prisma_js_1.prisma.trip.update({
            where: { id },
            data: {
                ...stringifyJsonFields(tripData, TRIP_JSON_FIELDS),
                ...searchData,
            },
            include: {
                departures: { orderBy: { orderIndex: 'asc' } },
            },
        });
        // Update departures if provided
        if (departures) {
            await prisma_js_1.prisma.tripDeparture.deleteMany({ where: { tripId: id } });
            if (departures.length > 0) {
                await prisma_js_1.prisma.tripDeparture.createMany({
                    data: departures.map(d => ({
                        tripId: id,
                        time: d.time,
                        place: d.place,
                        city: d.city,
                        mapsUrl: d.mapsUrl || null,
                        mapsQuery: d.mapsQuery || null,
                        orderIndex: d.orderIndex,
                    })),
                });
            }
        }
        const updated = await prisma_js_1.prisma.trip.findUnique({
            where: { id },
            include: {
                departures: { orderBy: { orderIndex: 'asc' } },
            },
        });
        return parseJsonFields(updated, TRIP_JSON_FIELDS);
    },
    async delete(id) {
        await this.findById(id);
        // Check if trip has associated visits or gallery entries that would be affected
        const counts = await prisma_js_1.prisma.trip.findUnique({
            where: { id },
            select: {
                _count: { select: { visits: true, galleryEntries: true } },
            },
        });
        if (counts && (counts._count.visits > 0 || counts._count.galleryEntries > 0)) {
            throw errorHandler_js_1.AppError.badRequest('Não é possível excluir viagem com visitas ou memórias associadas. Remova as associações primeiro.', { visits: counts._count.visits, galleryEntries: counts._count.galleryEntries });
        }
        await prisma_js_1.prisma.trip.delete({ where: { id } });
        return { success: true };
    },
    async publish(id) {
        // Ensure _search columns stay in sync (defensive: they don't change here but included for consistency)
        const trip = await prisma_js_1.prisma.trip.findUnique({ where: { id }, select: { title: true, city: true, category: true } });
        const tripData = await prisma_js_1.prisma.trip.update({
            where: { id },
            data: {
                status: 'OPEN',
                publishedAt: new Date(),
                titleSearch: trip ? (0, searchUtils_js_1.normalizeForSearch)(trip.title) : undefined,
                citySearch: trip ? (0, searchUtils_js_1.normalizeForSearch)(trip.city) : undefined,
                categorySearch: trip ? (0, searchUtils_js_1.normalizeForSearch)(trip.category) : undefined,
            },
        });
        return parseJsonFields(tripData, TRIP_JSON_FIELDS);
    },
    async unpublish(id) {
        // Ensure _search columns stay in sync (defensive: they don't change here but included for consistency)
        const trip = await prisma_js_1.prisma.trip.findUnique({ where: { id }, select: { title: true, city: true, category: true } });
        const tripData = await prisma_js_1.prisma.trip.update({
            where: { id },
            data: {
                status: 'DRAFT',
                titleSearch: trip ? (0, searchUtils_js_1.normalizeForSearch)(trip.title) : undefined,
                citySearch: trip ? (0, searchUtils_js_1.normalizeForSearch)(trip.city) : undefined,
                categorySearch: trip ? (0, searchUtils_js_1.normalizeForSearch)(trip.category) : undefined,
            },
        });
        return parseJsonFields(tripData, TRIP_JSON_FIELDS);
    },
};
// Visit service
const VISIT_JSON_FIELDS = ['images'];
exports.visitService = {
    async findAll(query) {
        const { page = 1, limit = 20, needsReview, tripId, city, region, hasCoords, search } = query;
        const skip = (page - 1) * limit;
        const where = {};
        if (needsReview !== undefined) {
            where.needsReview = needsReview;
        }
        if (tripId) {
            where.tripId = tripId;
        }
        // Apply case/accent-insensitive direct filters using normalized columns
        const cityFilter = (0, searchUtils_js_1.applyDirectFilter)(city, 'citySearch');
        if (cityFilter) {
            where.citySearch = cityFilter.citySearch;
        }
        const regionFilter = (0, searchUtils_js_1.applyDirectFilter)(region, 'regionSearch');
        if (regionFilter) {
            where.regionSearch = regionFilter.regionSearch;
        }
        if (hasCoords !== undefined) {
            if (hasCoords) {
                where.lat = { not: null };
                where.lng = { not: null };
            }
            else {
                where.OR = [{ lat: null }, { lng: null }];
            }
        }
        // Apply case/accent-insensitive search using normalized columns
        const searchClauses = (0, searchUtils_js_1.applySearchFilter)(search, ['titleSearch', 'citySearch', 'sourceSearch']);
        if (searchClauses) {
            where.OR = searchClauses;
        }
        const [visits, total] = await Promise.all([
            prisma_js_1.prisma.visit.findMany({
                where,
                include: {
                    trip: { select: { id: true, title: true, status: true } },
                    galleryEntries: { select: { id: true, title: true } },
                },
                orderBy: { date: 'desc' },
                skip,
                take: limit,
            }),
            prisma_js_1.prisma.visit.count({ where }),
        ]);
        return {
            data: visits.map(v => parseJsonFields(v, VISIT_JSON_FIELDS)),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    },
    async findById(id) {
        const visit = await prisma_js_1.prisma.visit.findUnique({
            where: { id },
            include: {
                trip: { select: { id: true, title: true, status: true } },
                galleryEntries: true,
            },
        });
        if (!visit) {
            throw errorHandler_js_1.AppError.notFound('Visita não encontrada');
        }
        return parseJsonFields(visit, VISIT_JSON_FIELDS);
    },
    async create(data) {
        // Validate tripId if provided
        if (data.tripId) {
            const trip = await prisma_js_1.prisma.trip.findUnique({ where: { id: data.tripId } });
            if (!trip) {
                throw errorHandler_js_1.AppError.badRequest('Viagem referenciada não existe', { tripId: data.tripId });
            }
        }
        // Generate storedIdentity if not provided (for manual creation)
        const storedIdentity = data.storedIdentity || `manual:${Date.now()}:${Math.random().toString(36).substring(7)}`;
        // Add normalized search columns
        const searchData = {
            titleSearch: (0, searchUtils_js_1.normalizeForSearch)(data.title || ''),
            citySearch: (0, searchUtils_js_1.normalizeForSearch)(data.city || ''),
            regionSearch: (0, searchUtils_js_1.normalizeForSearchRegion)(data.region || ''),
            sourceSearch: data.source ? (0, searchUtils_js_1.normalizeForSearch)(data.source) : '',
        };
        const visit = await prisma_js_1.prisma.visit.create({
            data: {
                ...stringifyJsonFields(data, VISIT_JSON_FIELDS),
                ...searchData,
                storedIdentity,
            },
            include: {
                trip: { select: { id: true, title: true } },
            },
        });
        return parseJsonFields(visit, VISIT_JSON_FIELDS);
    },
    async update(id, data) {
        // Check if visit exists
        await this.findById(id);
        // Validate tripId if provided
        if (data.tripId) {
            const trip = await prisma_js_1.prisma.trip.findUnique({ where: { id: data.tripId } });
            if (!trip) {
                throw errorHandler_js_1.AppError.badRequest('Viagem referenciada não existe', { tripId: data.tripId });
            }
        }
        // Update normalized search columns if relevant fields are being updated
        const searchData = {};
        if (data.title !== undefined) {
            searchData.titleSearch = (0, searchUtils_js_1.normalizeForSearch)(data.title);
        }
        if (data.city !== undefined) {
            searchData.citySearch = (0, searchUtils_js_1.normalizeForSearch)(data.city);
        }
        if (data.region !== undefined) {
            searchData.regionSearch = (0, searchUtils_js_1.normalizeForSearchRegion)(data.region);
        }
        if (data.source !== undefined) {
            searchData.sourceSearch = data.source ? (0, searchUtils_js_1.normalizeForSearch)(data.source) : '';
        }
        const visit = await prisma_js_1.prisma.visit.update({
            where: { id },
            data: {
                ...stringifyJsonFields(data, VISIT_JSON_FIELDS),
                ...searchData,
            },
            include: {
                trip: { select: { id: true, title: true } },
            },
        });
        return parseJsonFields(visit, VISIT_JSON_FIELDS);
    },
    async delete(id) {
        await this.findById(id);
        // Check if visit has associated gallery entries
        const counts = await prisma_js_1.prisma.visit.findUnique({
            where: { id },
            select: { _count: { select: { galleryEntries: true } } },
        });
        if (counts && counts._count.galleryEntries > 0) {
            throw errorHandler_js_1.AppError.badRequest('Não é possível excluir visita com memórias da galeria associadas. Remova as associações primeiro.', { galleryEntries: counts._count.galleryEntries });
        }
        await prisma_js_1.prisma.visit.delete({ where: { id } });
        return { success: true };
    },
    async associateWithTrip(visitId, tripId) {
        // Validate trip exists if provided
        if (tripId) {
            const trip = await prisma_js_1.prisma.trip.findUnique({ where: { id: tripId } });
            if (!trip) {
                throw errorHandler_js_1.AppError.badRequest('Viagem referenciada não existe', { tripId });
            }
        }
        // Fetch current visit data to preserve _search columns
        const currentVisit = await prisma_js_1.prisma.visit.findUnique({
            where: { id: visitId },
            select: { title: true, city: true, region: true, source: true }
        });
        const visit = await prisma_js_1.prisma.visit.update({
            where: { id: visitId },
            data: {
                tripId,
                needsReview: !tripId, // If associating, no longer needs review for association
                titleSearch: currentVisit ? (0, searchUtils_js_1.normalizeForSearch)(currentVisit.title) : undefined,
                citySearch: currentVisit ? (0, searchUtils_js_1.normalizeForSearch)(currentVisit.city) : undefined,
                regionSearch: currentVisit ? (0, searchUtils_js_1.normalizeForSearchRegion)(currentVisit.region) : undefined,
                sourceSearch: currentVisit && currentVisit.source ? (0, searchUtils_js_1.normalizeForSearch)(currentVisit.source) : '',
            },
            include: {
                trip: { select: { id: true, title: true } },
            },
        });
        return parseJsonFields(visit, VISIT_JSON_FIELDS);
    },
};
// Gallery service
const GALLERY_JSON_FIELDS = ['images'];
exports.galleryService = {
    async findAll(query) {
        const { page = 1, limit = 20, isFeatured, tripId, visitId, search } = query;
        const skip = (page - 1) * limit;
        const where = {};
        if (isFeatured !== undefined) {
            where.isFeatured = isFeatured;
        }
        if (tripId) {
            where.tripId = tripId;
        }
        if (visitId) {
            where.visitId = visitId;
        }
        // Apply case/accent-insensitive search using normalized columns
        const searchClauses = (0, searchUtils_js_1.applySearchFilter)(search, ['titleSearch', 'descriptionSearch']);
        if (searchClauses) {
            where.OR = searchClauses;
        }
        const [entries, total] = await Promise.all([
            prisma_js_1.prisma.galleryEntry.findMany({
                where,
                include: {
                    trip: { select: { id: true, title: true } },
                    visit: { select: { id: true, title: true } },
                },
                orderBy: [{ isFeatured: 'desc' }, { orderIndex: 'asc' }, { date: 'desc' }],
                skip,
                take: limit,
            }),
            prisma_js_1.prisma.galleryEntry.count({ where }),
        ]);
        return {
            data: entries.map(g => parseJsonFields(g, GALLERY_JSON_FIELDS)),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    },
    async findById(id) {
        const entry = await prisma_js_1.prisma.galleryEntry.findUnique({
            where: { id },
            include: {
                trip: { select: { id: true, title: true } },
                visit: { select: { id: true, title: true } },
            },
        });
        if (!entry) {
            throw errorHandler_js_1.AppError.notFound('Memória da galeria não encontrada');
        }
        return parseJsonFields(entry, GALLERY_JSON_FIELDS);
    },
    async create(data) {
        // Validate references
        if (data.tripId) {
            const trip = await prisma_js_1.prisma.trip.findUnique({ where: { id: data.tripId } });
            if (!trip) {
                throw errorHandler_js_1.AppError.badRequest('Viagem referenciada não existe', { tripId: data.tripId });
            }
        }
        if (data.visitId) {
            const visit = await prisma_js_1.prisma.visit.findUnique({ where: { id: data.visitId } });
            if (!visit) {
                throw errorHandler_js_1.AppError.badRequest('Visita referenciada não existe', { visitId: data.visitId });
            }
        }
        // If setting as featured, unset other featured entries
        if (data.isFeatured) {
            await prisma_js_1.prisma.galleryEntry.updateMany({
                where: { isFeatured: true },
                data: { isFeatured: false },
            });
        }
        // Generate storedIdentity if not provided (for manual creation)
        const storedIdentity = data.storedIdentity || `manual:${Date.now()}:${Math.random().toString(36).substring(7)}`;
        // Add normalized search columns
        const searchData = {
            titleSearch: (0, searchUtils_js_1.normalizeForSearch)(data.title || ''),
            descriptionSearch: (0, searchUtils_js_1.normalizeForSearch)(data.description || ''),
        };
        const entry = await prisma_js_1.prisma.galleryEntry.create({
            data: {
                ...stringifyJsonFields(data, GALLERY_JSON_FIELDS),
                ...searchData,
                storedIdentity,
            },
            include: {
                trip: { select: { id: true, title: true } },
                visit: { select: { id: true, title: true } },
            },
        });
        return parseJsonFields(entry, GALLERY_JSON_FIELDS);
    },
    async update(id, data) {
        await this.findById(id);
        // Validate references
        if (data.tripId) {
            const trip = await prisma_js_1.prisma.trip.findUnique({ where: { id: data.tripId } });
            if (!trip) {
                throw errorHandler_js_1.AppError.badRequest('Viagem referenciada não existe', { tripId: data.tripId });
            }
        }
        if (data.visitId) {
            const visit = await prisma_js_1.prisma.visit.findUnique({ where: { id: data.visitId } });
            if (!visit) {
                throw errorHandler_js_1.AppError.badRequest('Visita referenciada não existe', { visitId: data.visitId });
            }
        }
        // If setting as featured, unset other featured entries
        if (data.isFeatured) {
            await prisma_js_1.prisma.galleryEntry.updateMany({
                where: { isFeatured: true, id: { not: id } },
                data: { isFeatured: false },
            });
        }
        // Update normalized search columns if relevant fields are being updated
        const searchData = {};
        if (data.title !== undefined) {
            searchData.titleSearch = (0, searchUtils_js_1.normalizeForSearch)(data.title);
        }
        if (data.description !== undefined) {
            searchData.descriptionSearch = (0, searchUtils_js_1.normalizeForSearch)(data.description);
        }
        const entry = await prisma_js_1.prisma.galleryEntry.update({
            where: { id },
            data: {
                ...stringifyJsonFields(data, GALLERY_JSON_FIELDS),
                ...searchData,
            },
            include: {
                trip: { select: { id: true, title: true } },
                visit: { select: { id: true, title: true } },
            },
        });
        return parseJsonFields(entry, GALLERY_JSON_FIELDS);
    },
    async delete(id) {
        await this.findById(id);
        await prisma_js_1.prisma.galleryEntry.delete({ where: { id } });
        return { success: true };
    },
    async reorder(entries) {
        // Update order indices in a transaction
        await prisma_js_1.prisma.$transaction(entries.map(({ id, orderIndex }) => prisma_js_1.prisma.galleryEntry.update({
            where: { id },
            data: { orderIndex },
        })));
        return { success: true };
    },
};
// Dashboard service
exports.dashboardService = {
    async getStats() {
        const [tripsTotal, tripsPublished, tripsDraft, visitsTotal, visitsNeedsReview, visitsWithCoords, galleryTotal, galleryFeatured,] = await Promise.all([
            prisma_js_1.prisma.trip.count(),
            prisma_js_1.prisma.trip.count({ where: { status: 'OPEN' } }),
            prisma_js_1.prisma.trip.count({ where: { status: 'DRAFT' } }),
            prisma_js_1.prisma.visit.count(),
            prisma_js_1.prisma.visit.count({ where: { needsReview: true } }),
            prisma_js_1.prisma.visit.count({ where: { lat: { not: null }, lng: { not: null } } }),
            prisma_js_1.prisma.galleryEntry.count(),
            prisma_js_1.prisma.galleryEntry.count({ where: { isFeatured: true } }),
        ]);
        return {
            tripsTotal,
            tripsPublished,
            tripsDraft,
            visitsTotal,
            visitsNeedsReview,
            visitsWithCoords,
            galleryTotal,
            galleryFeatured,
        };
    },
};
//# sourceMappingURL=index.js.map