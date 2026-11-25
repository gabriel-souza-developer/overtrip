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
import { publicationProblems } from './tripReadiness.js';
import { settingsService } from './settingsService.js';
import { tripPeriodWhere } from '../utils/tripPeriod.js';
import {
  currentLegacyGalleryFilterWithConsistentRelations,
  currentLegacyLeadFilterWithConsistentTrip,
  currentLegacyTourismFilter,
  currentLegacyVisitFilterWithConsistentTrip,
  currentReservationCountInLegacyScope,
  legacyTourismOrganizationIdForNewRecord,
} from './legacyTourismScope.js';

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

type PublicationData = {
  title?: string | null;
  city?: string | null;
  region?: string | null;
  startDateISO?: Date | string | null;
  description?: string | null;
  free?: boolean | null;
  priceValue?: number | null;
  media?: unknown;
  meetingCity?: string | null;
  meetingPoint?: string | null;
  meetingTBD?: boolean | null;
  departures?: unknown;
};

function assertReadyForPublication(data: PublicationData) {
  const missing = publicationProblems(data);

  if (missing.length > 0) {
    throw AppError.badRequest(`Não é possível publicar: ${missing.join('; ')}.`);
  }
}

export const tripService = {
  async findAll(query: TripQueryInput) {
    const { page = 1, limit = 20, status, search, period } = query;
    const skip = (page - 1) * limit;
    
    const clauses: Prisma.TripWhereInput[] = [currentLegacyTourismFilter()];
    if (period) clauses.push(tripPeriodWhere(period));
    if (status) {
      clauses.push({ status });
    }

    // Apply case/accent-insensitive search using normalized columns
    const searchClauses = applySearchFilter(search, ['titleSearch', 'citySearch', 'categorySearch']);
    if (searchClauses) {
      clauses.push({ OR: searchClauses });
    }
    const where: Prisma.TripWhereInput = { AND: clauses };

    const [trips, total] = await Promise.all([
      prisma.trip.findMany({
        where,
        include: {
          departures: { orderBy: { orderIndex: 'asc' } },
          // Contagem filtrada pelo mesmo escopo/consistência de relação: nunca
          // soma visitas/memórias de outra organização vinculadas a esta viagem.
          _count: { select: { visits: { where: currentLegacyVisitFilterWithConsistentTrip() }, galleryEntries: { where: currentLegacyGalleryFilterWithConsistentRelations() } } },
        },
        // Próximas: a mais perto primeiro. Demais listas: a mais recente primeiro.
        orderBy: { startDateISO: period === 'upcoming' ? 'asc' : 'desc' },
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
    // O filtro de escopo entra na própria busca (não "buscar tudo e filtrar depois"):
    // uma viagem de outra empresa não deve nem ser encontrada pelo operador legado.
    const trip = await prisma.trip.findFirst({
      where: { id, ...currentLegacyTourismFilter() },
      include: {
        departures: { orderBy: { orderIndex: 'asc' } },
        // Mesmo escopo/consistência de relação do item acima: uma visita ou
        // memória de outra organização vinculada a esta viagem nunca aparece
        // aqui, mesmo que a viagem em si esteja no escopo do operador.
        visits: { where: { needsReview: false, ...currentLegacyVisitFilterWithConsistentTrip() } },
        galleryEntries: { where: { isFeatured: true, ...currentLegacyGalleryFilterWithConsistentRelations() } },
      },
    });

    if (!trip) {
      throw AppError.notFound('Viagem não encontrada');
    }

    return parseJsonFields(trip, TRIP_JSON_FIELDS);
  },

  async create(data: TripCreateInput) {
    const { departures, ...tripData } = data;
    const presentation = await settingsService.getTripPresentationDefaults();
    const tripWithDefaults = {
      ...tripData,
      buttonLabel: tripData.buttonLabel ?? presentation.buttonLabel,
      buttonClass: tripData.buttonClass ?? presentation.buttonClass,
      priceUnit: tripData.priceUnit ?? presentation.priceUnit,
    };

    if (tripWithDefaults.status === 'OPEN') assertReadyForPublication({ ...tripWithDefaults, departures });
    
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
      titleSearch: normalizeForSearch(tripWithDefaults.title || ''),
      citySearch: normalizeForSearch(tripWithDefaults.city || ''),
      categorySearch: normalizeForSearch(tripWithDefaults.category || ''),
    };

    const trip = await prisma.trip.create({
      data: {
        ...stringifyJsonFields(tripWithDefaults, TRIP_JSON_FIELDS),
        ...searchData,
        storedIdentity,
        // Nunca aceita organizationId do corpo da requisição (ausente do schema de
        // validação); a operação legada só pode criar dentro do próprio escopo.
        organizationId: legacyTourismOrganizationIdForNewRecord(),
        publishedAt: tripWithDefaults.status === 'OPEN' ? new Date() : undefined,
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

    return prisma.$transaction(async tx => {

    // Check if trip exists and is within the legacy scope (mesma consulta, não um
    // "existe em geral" seguido de checagem separada de organização).
    const row = await tx.trip.findFirst({ where: { id, ...currentLegacyTourismFilter() }, include: { departures: { orderBy: { orderIndex: 'asc' } } } });
    if (!row) throw AppError.notFound('Viagem não encontrada');
    const current = parseJsonFields(row, TRIP_JSON_FIELDS);

    // Uma viagem aberta continua precisando atender aos requisitos quando é
    // alterada. Sem isso, um cliente poderia remover foto, preço ou embarque
    // de uma viagem já publicada sem mudar o status.
    if ((tripData.status ?? current.status) === 'OPEN') {
      assertReadyForPublication({
        title: tripData.title ?? current.title, city: tripData.city ?? current.city, region: tripData.region ?? current.region,
        startDateISO: tripData.startDateISO ?? current.startDateISO, description: tripData.description ?? current.description,
        free: tripData.free ?? current.free, priceValue: tripData.priceValue === undefined ? current.priceValue : tripData.priceValue,
        media: tripData.media ?? current.media, meetingCity: tripData.meetingCity === undefined ? current.meetingCity : tripData.meetingCity,
        meetingPoint: tripData.meetingPoint === undefined ? current.meetingPoint : tripData.meetingPoint, meetingTBD: tripData.meetingTBD ?? current.meetingTBD,
        departures: departures ?? current.departures,
      });
    }

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
    const trip = await tx.trip.update({
      where: { id },
      data: {
        ...stringifyJsonFields(tripData, TRIP_JSON_FIELDS),
        ...searchData,
        ...(departures !== undefined ? { departures: { deleteMany: {}, create: departures.map(d => ({ ...d, mapsUrl: d.mapsUrl || null, mapsQuery: d.mapsQuery || null })) } } : {}),
        publishedAt: tripData.status === 'OPEN' && current.status !== 'OPEN' ? new Date() : undefined,
      },
      include: {
        departures: { orderBy: { orderIndex: 'asc' } },
      },
    });

    return parseJsonFields(trip, TRIP_JSON_FIELDS);
    });
  },

  async delete(id: string) {
    return prisma.$transaction(async tx => {
      // Existência e escopo checados na mesma transação da exclusão.
      const trip = await tx.trip.findFirst({ where: { id, ...currentLegacyTourismFilter() }, select: { id: true } });
      if (!trip) throw AppError.notFound('Viagem não encontrada');

      // Duas contagens por relação: a do próprio escopo (para a mensagem
      // informativa de sempre) e a global (sem filtro nenhum), para detectar
      // vínculo de outra organização. tripId/leadId têm onDelete Restrict ou
      // SetNull conforme a relação; nenhum dos dois é seguro aplicar sobre um
      // registro de terceiros, então a exclusão nunca chega a ser tentada
      // quando a contagem global aponta algo que a contagem do próprio
      // escopo não via.
      const [ownLeads, ownReservations, ownVisits, ownGallery, totalLeads, totalReservations, totalVisits, totalGallery] = await Promise.all([
        tx.lead.count({ where: { tripId: id, ...currentLegacyLeadFilterWithConsistentTrip() } }),
        currentReservationCountInLegacyScope(tx, { tripId: id }),
        tx.visit.count({ where: { tripId: id, ...currentLegacyVisitFilterWithConsistentTrip() } }),
        tx.galleryEntry.count({ where: { tripId: id, ...currentLegacyGalleryFilterWithConsistentRelations() } }),
        tx.lead.count({ where: { tripId: id } }),
        tx.reservation.count({ where: { tripId: id } }),
        tx.visit.count({ where: { tripId: id } }),
        tx.galleryEntry.count({ where: { tripId: id } }),
      ]);

      if (ownReservations > 0 || ownLeads > 0) {
        throw AppError.conflict('Não é possível excluir viagem com reservas ou interessados associados.', {
          reservations: ownReservations, leads: ownLeads,
        });
      }

      if (ownVisits > 0 || ownGallery > 0) {
        throw AppError.badRequest(
          'Não é possível excluir viagem com visitas ou memórias associadas. Remova as associações primeiro.',
          { visits: ownVisits, galleryEntries: ownGallery }
        );
      }

      // Vínculo de outra organização (dado anterior a este escopo, ou
      // produzido fora da API): bloqueio genérico, sem revelar quantidade nem
      // tipo de registro de terceiros.
      if (totalLeads > 0 || totalReservations > 0 || totalVisits > 0 || totalGallery > 0) {
        throw AppError.conflict('Não é possível excluir viagem: existem registros vinculados.');
      }

      try {
        await tx.trip.delete({ where: { id } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
          throw AppError.conflict('Não é possível excluir viagem com registros associados.');
        }
        throw error;
      }
      return { success: true };
    });
  },

  async publish(id: string) {
    return prisma.$transaction(async tx => {
      // A regra de publicação vale para todos os clientes da API, não só para o
      // formulário. Checagem de escopo e mutação na mesma transação.
      const trip = await tx.trip.findFirst({
        where: { id, ...currentLegacyTourismFilter() },
        select: { title: true, city: true, region: true, startDateISO: true, description: true, category: true, priceValue: true, free: true, media: true, meetingCity: true, meetingPoint: true, meetingTBD: true, departures: true },
      });
      if (!trip) throw AppError.notFound('Viagem não encontrada');
      assertReadyForPublication({ ...trip, media: parseJsonFields(trip, ['media']).media });
      const tripData = await tx.trip.update({
        where: { id },
        data: {
          status: 'OPEN',
          publishedAt: new Date(),
          titleSearch: normalizeForSearch(trip.title),
          citySearch: normalizeForSearch(trip.city),
          categorySearch: normalizeForSearch(trip.category),
        },
      });
      return parseJsonFields(tripData, TRIP_JSON_FIELDS);
    });
  },

  async unpublish(id: string) {
    return prisma.$transaction(async tx => {
      // Ensure _search columns stay in sync (defensive: they don't change here but included for consistency)
      const trip = await tx.trip.findFirst({ where: { id, ...currentLegacyTourismFilter() }, select: { title: true, city: true, category: true } });
      if (!trip) throw AppError.notFound('Viagem não encontrada');
      const tripData = await tx.trip.update({
        where: { id },
        data: {
          status: 'DRAFT',
          titleSearch: normalizeForSearch(trip.title),
          citySearch: normalizeForSearch(trip.city),
          categorySearch: normalizeForSearch(trip.category),
        },
      });
      return parseJsonFields(tripData, TRIP_JSON_FIELDS);
    });
  },
};

// Visit service
const VISIT_JSON_FIELDS = ['images'];

export const visitService = {
  async findAll(query: VisitQueryInput) {
    const { page = 1, limit = 20, needsReview, tripId, city, region, hasCoords, search } = query;
    const skip = (page - 1) * limit;

    const businessWhere: Prisma.VisitWhereInput = {};

    if (needsReview !== undefined) {
      businessWhere.needsReview = needsReview;
    }

    if (tripId) {
      businessWhere.tripId = tripId;
    }

    // Apply case/accent-insensitive direct filters using normalized columns
    const cityFilter = applyDirectFilter(city, 'citySearch');
    if (cityFilter) {
      businessWhere.citySearch = cityFilter.citySearch;
    }

    const regionFilter = applyDirectFilter(region, 'regionSearch');
    if (regionFilter) {
      businessWhere.regionSearch = regionFilter.regionSearch;
    }

    if (hasCoords !== undefined) {
      if (hasCoords) {
        businessWhere.lat = { not: null };
        businessWhere.lng = { not: null };
      } else {
        businessWhere.AND = [{ OR: [{ lat: null }, { lng: null }] }];
      }
    }

    // Apply case/accent-insensitive search using normalized columns
    const searchClauses = applySearchFilter(search, ['titleSearch', 'citySearch', 'sourceSearch']);
    if (searchClauses) {
      businessWhere.OR = searchClauses;
    }

    // Escopo (próprio registro + viagem vinculada) combinado por AND, nunca
    // colidindo com AND/OR já usados pelos filtros de negócio acima.
    const where: Prisma.VisitWhereInput = { AND: [currentLegacyVisitFilterWithConsistentTrip(), businessWhere] };

    const [visits, total] = await Promise.all([
      prisma.visit.findMany({
        where,
        include: {
          trip: { select: { id: true, title: true, status: true } },
          // Memórias da galeria de outra empresa vinculadas a esta visita
          // (vínculo cruzado pré-existente, ou produzido fora da API) nunca aparecem.
          galleryEntries: { where: currentLegacyGalleryFilterWithConsistentRelations(), select: { id: true, title: true } },
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
    // Mesma consulta: uma visita de outra empresa, ou cuja viagem vinculada
    // seja inconsistente com o escopo, não deve nem ser encontrada.
    const visit = await prisma.visit.findFirst({
      where: { id, ...currentLegacyVisitFilterWithConsistentTrip() },
      include: {
        trip: { select: { id: true, title: true, status: true } },
        galleryEntries: { where: currentLegacyGalleryFilterWithConsistentRelations() },
      },
    });

    if (!visit) {
      throw AppError.notFound('Visita não encontrada');
    }

    return parseJsonFields(visit, VISIT_JSON_FIELDS);
  },

  async create(data: VisitCreateInput) {
    return prisma.$transaction(async tx => {
      // Checagem de escopo e criação na mesma transação: nunca associa a uma
      // viagem fora do escopo legado, mesmo que o ID exista em outra empresa
      // (comportamento idêntico a "não existe").
      if (data.tripId) {
        const trip = await tx.trip.findFirst({ where: { id: data.tripId, ...currentLegacyTourismFilter() } });
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

      const visit = await tx.visit.create({
        data: {
          ...stringifyJsonFields(data, VISIT_JSON_FIELDS),
          ...searchData,
          storedIdentity,
          organizationId: legacyTourismOrganizationIdForNewRecord(),
        },
        include: {
          trip: { select: { id: true, title: true } },
        },
      });

      return parseJsonFields(visit, VISIT_JSON_FIELDS);
    });
  },

  async update(id: string, data: VisitUpdateInput) {
    return prisma.$transaction(async tx => {
      // Existência e escopo da visita checados na mesma transação da atualização.
      const exists = await tx.visit.findFirst({ where: { id, ...currentLegacyVisitFilterWithConsistentTrip() }, select: { id: true } });
      if (!exists) throw AppError.notFound('Visita não encontrada');

      if (data.tripId) {
        const trip = await tx.trip.findFirst({ where: { id: data.tripId, ...currentLegacyTourismFilter() } });
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

      const visit = await tx.visit.update({
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
    });
  },

  async delete(id: string) {
    return prisma.$transaction(async tx => {
      // Existência e escopo da visita checados na mesma transação da exclusão.
      const exists = await tx.visit.findFirst({ where: { id, ...currentLegacyVisitFilterWithConsistentTrip() }, select: { id: true } });
      if (!exists) throw AppError.notFound('Visita não encontrada');

      // Contagem do próprio escopo (mensagem informativa) e contagem global
      // (sem filtro, detecta vínculo de outra empresa). GalleryEntry.visitId
      // tem onDelete SetNull: se uma memória estrangeira ainda referenciar
      // esta visita, excluir a visita a alteraria silenciosamente — por isso
      // a exclusão nunca é tentada quando a contagem global aponta algo que
      // a contagem do próprio escopo não via.
      const [ownGalleryEntries, totalGalleryEntries] = await Promise.all([
        tx.galleryEntry.count({ where: { visitId: id, ...currentLegacyGalleryFilterWithConsistentRelations() } }),
        tx.galleryEntry.count({ where: { visitId: id } }),
      ]);

      if (ownGalleryEntries > 0) {
        throw AppError.badRequest(
          'Não é possível excluir visita com memórias da galeria associadas. Remova as associações primeiro.',
          { galleryEntries: ownGalleryEntries }
        );
      }

      if (totalGalleryEntries > 0) {
        throw AppError.conflict('Não é possível excluir visita: existem registros vinculados.');
      }

      await tx.visit.delete({ where: { id } });
      return { success: true };
    });
  },

  async associateWithTrip(visitId: string, tripId: string | null) {
    return prisma.$transaction(async tx => {
      // Checagem de escopo da viagem e atualização do vínculo na mesma transação.
      if (tripId) {
        const trip = await tx.trip.findFirst({ where: { id: tripId, ...currentLegacyTourismFilter() } });
        if (!trip) {
          throw AppError.badRequest('Viagem referenciada não existe', { tripId });
        }
      }

      // Fetch current visit data to preserve _search columns
      const currentVisit = await tx.visit.findFirst({
        where: { id: visitId, ...currentLegacyVisitFilterWithConsistentTrip() },
        select: { title: true, city: true, region: true, source: true },
      });
      if (!currentVisit) throw AppError.notFound('Visita não encontrada');

      const visit = await tx.visit.update({
        where: { id: visitId },
        data: {
          tripId,
          titleSearch: normalizeForSearch(currentVisit.title),
          citySearch: normalizeForSearch(currentVisit.city),
          regionSearch: normalizeForSearchRegion(currentVisit.region),
          sourceSearch: currentVisit.source ? normalizeForSearch(currentVisit.source) : '',
        },
        include: {
          trip: { select: { id: true, title: true } },
        },
      });

      return parseJsonFields(visit, VISIT_JSON_FIELDS);
    });
  },
};

// Gallery service
const GALLERY_JSON_FIELDS = ['images'];

export const galleryService = {
  async findAll(query: GalleryQueryInput) {
    const { page = 1, limit = 20, isFeatured, tripId, visitId, search } = query;
    const skip = (page - 1) * limit;
    
    const businessWhere: Prisma.GalleryEntryWhereInput = {};

    if (isFeatured !== undefined) {
      businessWhere.isFeatured = isFeatured;
    }

    if (tripId) {
      businessWhere.tripId = tripId;
    }

    if (visitId) {
      businessWhere.visitId = visitId;
    }

    // Apply case/accent-insensitive search using normalized columns
    const searchClauses = applySearchFilter(search, ['titleSearch', 'descriptionSearch']);
    if (searchClauses) {
      businessWhere.OR = searchClauses;
    }

    // Escopo (próprio registro + viagem e visita vinculadas) combinado por
    // AND, nunca colidindo com AND/OR já usados pelos filtros de negócio acima.
    const where: Prisma.GalleryEntryWhereInput = { AND: [currentLegacyGalleryFilterWithConsistentRelations(), businessWhere] };

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
    // Mesma consulta: uma memória de outra empresa, ou cuja viagem/visita
    // vinculada seja inconsistente com o escopo, não deve nem ser encontrada.
    const entry = await prisma.galleryEntry.findFirst({
      where: { id, ...currentLegacyGalleryFilterWithConsistentRelations() },
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
    return prisma.$transaction(async tx => {
      // Checagem das referências e criação na mesma transação: nunca associa a
      // uma viagem fora do escopo legado, mesmo que o ID exista em outra
      // empresa (comportamento idêntico a "não existe").
      if (data.tripId) {
        const trip = await tx.trip.findFirst({ where: { id: data.tripId, ...currentLegacyTourismFilter() } });
        if (!trip) {
          throw AppError.badRequest('Viagem referenciada não existe', { tripId: data.tripId });
        }
      }

      if (data.visitId) {
        const visit = await tx.visit.findFirst({ where: { id: data.visitId, ...currentLegacyVisitFilterWithConsistentTrip() } });
        if (!visit) {
          throw AppError.badRequest('Visita referenciada não existe', { visitId: data.visitId });
        }
      }

      // If setting as featured, unset other featured entries — só as do
      // próprio escopo: destacar uma memória nunca pode desmarcar o destaque
      // de outra empresa.
      if (data.isFeatured) {
        await tx.galleryEntry.updateMany({
          where: { isFeatured: true, ...currentLegacyGalleryFilterWithConsistentRelations() },
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

      const entry = await tx.galleryEntry.create({
        data: {
          ...stringifyJsonFields(data, GALLERY_JSON_FIELDS),
          ...searchData,
          storedIdentity,
          organizationId: legacyTourismOrganizationIdForNewRecord(),
        },
        include: {
          trip: { select: { id: true, title: true } },
          visit: { select: { id: true, title: true } },
        },
      });

      return parseJsonFields(entry, GALLERY_JSON_FIELDS);
    });
  },

  async update(id: string, data: GalleryUpdateInput) {
    return prisma.$transaction(async tx => {
      const exists = await tx.galleryEntry.findFirst({ where: { id, ...currentLegacyGalleryFilterWithConsistentRelations() }, select: { id: true } });
      if (!exists) throw AppError.notFound('Memória da galeria não encontrada');

      // Validate references (mesma transação da atualização)
      if (data.tripId) {
        const trip = await tx.trip.findFirst({ where: { id: data.tripId, ...currentLegacyTourismFilter() } });
        if (!trip) {
          throw AppError.badRequest('Viagem referenciada não existe', { tripId: data.tripId });
        }
      }

      if (data.visitId) {
        const visit = await tx.visit.findFirst({ where: { id: data.visitId, ...currentLegacyVisitFilterWithConsistentTrip() } });
        if (!visit) {
          throw AppError.badRequest('Visita referenciada não existe', { visitId: data.visitId });
        }
      }

      // If setting as featured, unset other featured entries — só as do
      // próprio escopo: destacar uma memória nunca pode desmarcar o destaque
      // de outra empresa.
      if (data.isFeatured) {
        await tx.galleryEntry.updateMany({
          where: { isFeatured: true, id: { not: id }, ...currentLegacyGalleryFilterWithConsistentRelations() },
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

      const entry = await tx.galleryEntry.update({
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
    });
  },

  async delete(id: string) {
    return prisma.$transaction(async tx => {
      // Existência e escopo checados na mesma transação da exclusão.
      const exists = await tx.galleryEntry.findFirst({ where: { id, ...currentLegacyGalleryFilterWithConsistentRelations() }, select: { id: true } });
      if (!exists) throw AppError.notFound('Memória da galeria não encontrada');
      await tx.galleryEntry.delete({ where: { id } });
      return { success: true };
    });
  },

  async reorder(entries: { id: string; orderIndex: number }[]) {
    return prisma.$transaction(async tx => {
      // Reordenar nunca pode alterar uma memória de outra empresa: todo o
      // lote é validado contra o escopo antes de qualquer escrita; se um só
      // ID for estrangeiro ou inexistente, o lote inteiro é rejeitado.
      const ids = entries.map(e => e.id);
      const scoped = await tx.galleryEntry.findMany({
        where: { id: { in: ids }, ...currentLegacyGalleryFilterWithConsistentRelations() },
        select: { id: true },
      });
      if (scoped.length !== new Set(ids).size) {
        throw AppError.notFound('Uma ou mais memórias da galeria não foram encontradas.');
      }

      await Promise.all(entries.map(({ id, orderIndex }) =>
        tx.galleryEntry.update({ where: { id }, data: { orderIndex } })
      ));

      return { success: true };
    });
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
      prisma.trip.count({ where: currentLegacyTourismFilter() }),
      prisma.trip.count({ where: { AND: [currentLegacyTourismFilter(), { status: 'OPEN' }] } }),
      prisma.trip.count({ where: { AND: [currentLegacyTourismFilter(), { status: 'DRAFT' }] } }),
      prisma.visit.count({ where: currentLegacyVisitFilterWithConsistentTrip() }),
      prisma.visit.count({ where: { AND: [currentLegacyVisitFilterWithConsistentTrip(), { needsReview: true }] } }),
      prisma.visit.count({ where: { AND: [currentLegacyVisitFilterWithConsistentTrip(), { lat: { not: null }, lng: { not: null } }] } }),
      prisma.galleryEntry.count({ where: currentLegacyGalleryFilterWithConsistentRelations() }),
      prisma.galleryEntry.count({ where: { AND: [currentLegacyGalleryFilterWithConsistentRelations(), { isFeatured: true }] } }),
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
