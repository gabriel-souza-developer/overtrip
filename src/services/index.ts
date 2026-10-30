import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { 
  TripCreateInput, 
  TripUpdateInput, 
  TripQueryInput,
  VisitCreateInput,
  VisitUpdateInput,
  VisitQueryInput,
  GalleryCreateInput,
  GalleryUpdateInput,
  GalleryQueryInput,
} from '../validators/index.js';
import { normalizeForSearch, normalizeForSearchRegion, applySearchFilter, applyDirectFilter } from '../utils/searchUtils.js';

function parseJsonFields(data: any, jsonFields: string[]): any {
  const result = { ...data };
  for (const field of jsonFields) {
    if (result[field] && typeof result[field] === 'string') {
      try {
        result[field] = JSON.parse(result[field]);
      } catch {
        // Keep as string if not valid JSON
      }
    }
  }
  return result;
}

function stringifyJsonFields(data: any, jsonFields: string[]): any {
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

export const tripService = {
  async findAll(query: TripQueryInput) {
    const { page = 1, limit = 20, status, search } = query;
    const skip = (page - 1) * limit;
    
    const where: Prisma.TripWhereInput = {};
    
    if (status) {
      where.status = status;
    }
    
    // Apply case/accent-insensitive search using normalized columns
    const searchClauses = applySearchFilter(search, ['titleSearch', 'citySearch', 'categorySearch']);
    if (searchClauses) {
      where.OR = searchClauses;
    }

    const [trips, total] = await Promise.all([
      prisma.trip.findMany({
        where,
        include: {
          departures: { orderBy: { orderIndex: 'asc' } },
          _count: { select: { visits: true, galleryEntries: true } },
        },
        orderBy: { startDateISO: 'desc' },
        skip,
        take: limit,
      }),
      prisma.trip.count({ where }),
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

  async findById(id: string) {
    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        departures: { orderBy: { orderIndex: 'asc' } },
        visits: { where: { needsReview: false } },
        galleryEntries: { where: { isFeatured: true } },
      },
    });

    if (!trip) {
      throw AppError.notFound('Viagem não encontrada');
    }

    return parseJsonFields(trip, TRIP_JSON_FIELDS);
  },

  async create(data: TripCreateInput) {
    const { departures, ...tripData } = data;
    
    // Generate storedIdentity if not provided (for manual creation)
    const storedIdentity = data.storedIdentity || `manual:${Date.now()}:${Math.random().toString(36).substring(7)}`;
    
    // Check if storedIdentity already exists
    const existing = await prisma.trip.findUnique({
      where: { storedIdentity },
    });
    if (existing) {
      throw AppError.conflict('Viagem com esta identidade já existe', { storedIdentity });
    }

    // Add normalized search columns
    const searchData = {
      titleSearch: normalizeForSearch(tripData.title || ''),
      citySearch: normalizeForSearch(tripData.city || ''),
      categorySearch: normalizeForSearch(tripData.category || ''),
    };

    const trip = await prisma.trip.create({
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

  async update(id: string, data: TripUpdateInput) {
    const { departures, ...tripData } = data;

    // Check if trip exists
    await this.findById(id);

    // Update normalized search columns if relevant fields are being updated
    const searchData: Record<string, string> = {};
    if (tripData.title !== undefined) {
      searchData.titleSearch = normalizeForSearch(tripData.title);
    }
    if (tripData.city !== undefined) {
      searchData.citySearch = normalizeForSearch(tripData.city);
    }
    if (tripData.category !== undefined) {
      searchData.categorySearch = normalizeForSearch(tripData.category);
    }

    // Update trip
    const trip = await prisma.trip.update({
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
      await prisma.tripDeparture.deleteMany({ where: { tripId: id } });
      
      if (departures.length > 0) {
        await prisma.tripDeparture.createMany({
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

    const updated = await prisma.trip.findUnique({
      where: { id },
      include: {
        departures: { orderBy: { orderIndex: 'asc' } },
      },
    });

    return parseJsonFields(updated!, TRIP_JSON_FIELDS);
  },

  async delete(id: string) {
    await this.findById(id);
    
    // Check if trip has associated visits or gallery entries that would be affected
    const counts = await prisma.trip.findUnique({
      where: { id },
      select: {
        _count: { select: { visits: true, galleryEntries: true } },
      },
    });

    if (counts && (counts._count.visits > 0 || counts._count.galleryEntries > 0)) {
      throw AppError.badRequest(
        'Não é possível excluir viagem com visitas ou memórias associadas. Remova as associações primeiro.',
        { visits: counts._count.visits, galleryEntries: counts._count.galleryEntries }
      );
    }

    await prisma.trip.delete({ where: { id } });
    return { success: true };
  },

  async publish(id: string) {
    // Ensure _search columns stay in sync (defensive: they don't change here but included for consistency)
    const trip = await prisma.trip.findUnique({ where: { id }, select: { title: true, city: true, category: true } });
    const tripData = await prisma.trip.update({
      where: { id },
      data: { 
        status: 'OPEN',
        publishedAt: new Date(),
        titleSearch: trip ? normalizeForSearch(trip.title) : undefined,
        citySearch: trip ? normalizeForSearch(trip.city) : undefined,
        categorySearch: trip ? normalizeForSearch(trip.category) : undefined,
      },
    });
    return parseJsonFields(tripData, TRIP_JSON_FIELDS);
  },

  async unpublish(id: string) {
    // Ensure _search columns stay in sync (defensive: they don't change here but included for consistency)
    const trip = await prisma.trip.findUnique({ where: { id }, select: { title: true, city: true, category: true } });
    const tripData = await prisma.trip.update({
      where: { id },
      data: { 
        status: 'DRAFT',
        titleSearch: trip ? normalizeForSearch(trip.title) : undefined,
        citySearch: trip ? normalizeForSearch(trip.city) : undefined,
        categorySearch: trip ? normalizeForSearch(trip.category) : undefined,
      },
    });
    return parseJsonFields(tripData, TRIP_JSON_FIELDS);
  },
};

// Visit service
const VISIT_JSON_FIELDS = ['images'];

export const visitService = {
  async findAll(query: VisitQueryInput) {
    const { page = 1, limit = 20, needsReview, tripId, city, region, hasCoords, search } = query;
    const skip = (page - 1) * limit;
    
    const where: Prisma.VisitWhereInput = {};
    
    if (needsReview !== undefined) {
      where.needsReview = needsReview;
    }
    
    if (tripId) {
      where.tripId = tripId;
    }
    
    // Apply case/accent-insensitive direct filters using normalized columns
    const cityFilter = applyDirectFilter(city, 'citySearch');
    if (cityFilter) {
      where.citySearch = cityFilter.citySearch;
    }
    
    const regionFilter = applyDirectFilter(region, 'regionSearch');
    if (regionFilter) {
      where.regionSearch = regionFilter.regionSearch;
    }
    
    if (hasCoords !== undefined) {
      if (hasCoords) {
        where.lat = { not: null };
        where.lng = { not: null };
      } else {
        where.OR = [{ lat: null }, { lng: null }];
      }
    }
    
    // Apply case/accent-insensitive search using normalized columns
    const searchClauses = applySearchFilter(search, ['titleSearch', 'citySearch', 'sourceSearch']);
    if (searchClauses) {
      where.OR = searchClauses;
    }

    const [visits, total] = await Promise.all([
      prisma.visit.findMany({
        where,
        include: {
          trip: { select: { id: true, title: true, status: true } },
          galleryEntries: { select: { id: true, title: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.visit.count({ where }),
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

  async findById(id: string) {
    const visit = await prisma.visit.findUnique({
      where: { id },
      include: {
        trip: { select: { id: true, title: true, status: true } },
        galleryEntries: true,
      },
    });

    if (!visit) {
      throw AppError.notFound('Visita não encontrada');
    }

    return parseJsonFields(visit, VISIT_JSON_FIELDS);
  },

  async create(data: VisitCreateInput) {
    // Validate tripId if provided
    if (data.tripId) {
      const trip = await prisma.trip.findUnique({ where: { id: data.tripId } });
      if (!trip) {
        throw AppError.badRequest('Viagem referenciada não existe', { tripId: data.tripId });
      }
    }

    // Generate storedIdentity if not provided (for manual creation)
    const storedIdentity = data.storedIdentity || `manual:${Date.now()}:${Math.random().toString(36).substring(7)}`;

    // Add normalized search columns
    const searchData = {
      titleSearch: normalizeForSearch(data.title || ''),
      citySearch: normalizeForSearch(data.city || ''),
      regionSearch: normalizeForSearchRegion(data.region || ''),
      sourceSearch: data.source ? normalizeForSearch(data.source) : '',
    };

    const visit = await prisma.visit.create({
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

  async update(id: string, data: VisitUpdateInput) {
    // Check if visit exists
    await this.findById(id);

    // Validate tripId if provided
    if (data.tripId) {
      const trip = await prisma.trip.findUnique({ where: { id: data.tripId } });
      if (!trip) {
        throw AppError.badRequest('Viagem referenciada não existe', { tripId: data.tripId });
      }
    }

    // Update normalized search columns if relevant fields are being updated
    const searchData: Record<string, string> = {};
    if (data.title !== undefined) {
      searchData.titleSearch = normalizeForSearch(data.title);
    }
    if (data.city !== undefined) {
      searchData.citySearch = normalizeForSearch(data.city);
    }
    if (data.region !== undefined) {
      searchData.regionSearch = normalizeForSearchRegion(data.region);
    }
    if (data.source !== undefined) {
      searchData.sourceSearch = data.source ? normalizeForSearch(data.source) : '';
    }

    const visit = await prisma.visit.update({
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

  async delete(id: string) {
    await this.findById(id);
    
    // Check if visit has associated gallery entries
    const counts = await prisma.visit.findUnique({
      where: { id },
      select: { _count: { select: { galleryEntries: true } } },
    });

    if (counts && counts._count.galleryEntries > 0) {
      throw AppError.badRequest(
        'Não é possível excluir visita com memórias da galeria associadas. Remova as associações primeiro.',
        { galleryEntries: counts._count.galleryEntries }
      );
    }

    await prisma.visit.delete({ where: { id } });
    return { success: true };
  },

  async associateWithTrip(visitId: string, tripId: string | null) {
    // Validate trip exists if provided
    if (tripId) {
      const trip = await prisma.trip.findUnique({ where: { id: tripId } });
      if (!trip) {
        throw AppError.badRequest('Viagem referenciada não existe', { tripId });
      }
    }

    // Fetch current visit data to preserve _search columns
    const currentVisit = await prisma.visit.findUnique({ 
      where: { id: visitId }, 
      select: { title: true, city: true, region: true, source: true } 
    });

    const visit = await prisma.visit.update({
      where: { id: visitId },
      data: { 
        tripId,
        needsReview: !tripId, // If associating, no longer needs review for association
        titleSearch: currentVisit ? normalizeForSearch(currentVisit.title) : undefined,
        citySearch: currentVisit ? normalizeForSearch(currentVisit.city) : undefined,
        regionSearch: currentVisit ? normalizeForSearchRegion(currentVisit.region) : undefined,
        sourceSearch: currentVisit && currentVisit.source ? normalizeForSearch(currentVisit.source) : '',
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

export const galleryService = {
  async findAll(query: GalleryQueryInput) {
    const { page = 1, limit = 20, isFeatured, tripId, visitId, search } = query;
    const skip = (page - 1) * limit;
    
    const where: Prisma.GalleryEntryWhereInput = {};
    
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
    const searchClauses = applySearchFilter(search, ['titleSearch', 'descriptionSearch']);
    if (searchClauses) {
      where.OR = searchClauses;
    }

    const [entries, total] = await Promise.all([
      prisma.galleryEntry.findMany({
        where,
        include: {
          trip: { select: { id: true, title: true } },
          visit: { select: { id: true, title: true } },
        },
        orderBy: [{ isFeatured: 'desc' }, { orderIndex: 'asc' }, { date: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.galleryEntry.count({ where }),
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

  async findById(id: string) {
    const entry = await prisma.galleryEntry.findUnique({
      where: { id },
      include: {
        trip: { select: { id: true, title: true } },
        visit: { select: { id: true, title: true } },
      },
    });

    if (!entry) {
      throw AppError.notFound('Memória da galeria não encontrada');
    }

    return parseJsonFields(entry, GALLERY_JSON_FIELDS);
  },

  async create(data: GalleryCreateInput) {
    // Validate references
    if (data.tripId) {
      const trip = await prisma.trip.findUnique({ where: { id: data.tripId } });
      if (!trip) {
        throw AppError.badRequest('Viagem referenciada não existe', { tripId: data.tripId });
      }
    }
    
    if (data.visitId) {
      const visit = await prisma.visit.findUnique({ where: { id: data.visitId } });
      if (!visit) {
        throw AppError.badRequest('Visita referenciada não existe', { visitId: data.visitId });
      }
    }

    // If setting as featured, unset other featured entries
    if (data.isFeatured) {
      await prisma.galleryEntry.updateMany({
        where: { isFeatured: true },
        data: { isFeatured: false },
      });
    }

    // Generate storedIdentity if not provided (for manual creation)
    const storedIdentity = data.storedIdentity || `manual:${Date.now()}:${Math.random().toString(36).substring(7)}`;

    // Add normalized search columns
    const searchData = {
      titleSearch: normalizeForSearch(data.title || ''),
      descriptionSearch: normalizeForSearch(data.description || ''),
    };

    const entry = await prisma.galleryEntry.create({
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

  async update(id: string, data: GalleryUpdateInput) {
    await this.findById(id);

    // Validate references
    if (data.tripId) {
      const trip = await prisma.trip.findUnique({ where: { id: data.tripId } });
      if (!trip) {
        throw AppError.badRequest('Viagem referenciada não existe', { tripId: data.tripId });
      }
    }
    
    if (data.visitId) {
      const visit = await prisma.visit.findUnique({ where: { id: data.visitId } });
      if (!visit) {
        throw AppError.badRequest('Visita referenciada não existe', { visitId: data.visitId });
      }
    }

    // If setting as featured, unset other featured entries
    if (data.isFeatured) {
      await prisma.galleryEntry.updateMany({
        where: { isFeatured: true, id: { not: id } },
        data: { isFeatured: false },
      });
    }

    // Update normalized search columns if relevant fields are being updated
    const searchData: Record<string, string> = {};
    if (data.title !== undefined) {
      searchData.titleSearch = normalizeForSearch(data.title);
    }
    if (data.description !== undefined) {
      searchData.descriptionSearch = normalizeForSearch(data.description);
    }

    const entry = await prisma.galleryEntry.update({
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

  async delete(id: string) {
    await this.findById(id);
    await prisma.galleryEntry.delete({ where: { id } });
    return { success: true };
  },

  async reorder(entries: { id: string; orderIndex: number }[]) {
    // Update order indices in a transaction
    await prisma.$transaction(
      entries.map(({ id, orderIndex }) =>
        prisma.galleryEntry.update({
          where: { id },
          data: { orderIndex },
        })
      )
    );

    return { success: true };
  },
};

// Dashboard service
export const dashboardService = {
  async getStats() {
    const [
      tripsTotal,
      tripsPublished,
      tripsDraft,
      visitsTotal,
      visitsNeedsReview,
      visitsWithCoords,
      galleryTotal,
      galleryFeatured,
    ] = await Promise.all([
      prisma.trip.count(),
      prisma.trip.count({ where: { status: 'OPEN' } }),
      prisma.trip.count({ where: { status: 'DRAFT' } }),
      prisma.visit.count(),
      prisma.visit.count({ where: { needsReview: true } }),
      prisma.visit.count({ where: { lat: { not: null }, lng: { not: null } } }),
      prisma.galleryEntry.count(),
      prisma.galleryEntry.count({ where: { isFeatured: true } }),
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