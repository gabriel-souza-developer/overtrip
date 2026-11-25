import { randomBytes } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { assertOrganizationWriteAccess, requireOrganizationMembership, type OrganizationRequest } from '../middleware/organizationContext.js';
import { applySearchFilter, normalizeForSearch } from '../utils/searchUtils.js';
import { tripPeriodWhere } from '../utils/tripPeriod.js';
import { assertOwnedImages, filterOwnedImages, parseStoredImages } from '../services/organizationOwnedMedia.js';
import organizationTripDocumentRoutes from './organizationTripDocumentRoutes.js';

// The parent router authenticates first. No legacy routes or related global
// records (leads, reservations) are exposed here. Mídia é só a enviada pela
// própria empresa (ver organizationOwnedMedia.ts); nunca links externos ou
// arquivos de assets/ do site legado.
const router = Router({ mergeParams: true });
router.use(requireOrganizationMembership());

// PDFs do roteiro desta viagem: rota própria (OWNER/ADMIN, titularidade
// revalidada a cada requisição), nunca a mesma rota legada — ver
// organizationTripDocumentRoutes.ts.
router.use('/:tripId/documents', organizationTripDocumentRoutes);

const listSelect = { id: true, title: true, category: true, description: true, city: true, region: true, startDateISO: true, endDateISO: true, status: true, updatedAt: true } as const;
// Projeção completa de um rascunho: nunca inclui organizationId, status
// diferente do já armazenado, publishedAt ou qualquer relação de cliente
// (lead/reserva/visita/galeria) — essas seguem fora do escopo desta rota.
const detailSelect = {
  id: true, title: true, headlineDisplay: true, category: true, filterCategory: true, description: true,
  city: true, region: true, startDateISO: true, endDateISO: true,
  departureTime: true, departureTolerance: true, returnTime: true, scheduleInfo: true, scheduleTBD: true,
  priceValue: true, priceDisplay: true, priceUnit: true, free: true,
  intensityClass: true, spotsLeft: true, trailDistance: true, supportPoint: true, supportPointInfo: true,
  meetingCity: true, meetingPoint: true, meetingTBD: true, meetingDetails: true, meetingMapsQuery: true,
  includes: true, includesHighlight: true, itinerary: true, routeNotes: true, importantInfo: true,
  media: true, status: true, updatedAt: true,
  departures: { select: { id: true, time: true, place: true, city: true, mapsUrl: true, mapsQuery: true, orderIndex: true }, orderBy: { orderIndex: 'asc' as const } },
} as const;

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch { return []; }
}

type DetailRow = {
  media: string; includes: string; itinerary: string | null; routeNotes: string | null; importantInfo: string | null;
  departures: Array<{ id: string; time: string; place: string; city: string; mapsUrl: string | null; mapsQuery: string | null; orderIndex: number }>;
};
/** Mídia só é devolvida se ainda pertencer e estiver publicada por esta empresa (ver organizationOwnedMedia.ts). */
async function presentTrips<T extends DetailRow>(organizationId: string, rows: T[]) {
  const parsedMedia = rows.map((row) => parseStoredImages(row.media, 20));
  const rewrittenMedia = await filterOwnedImages(prisma, organizationId, parsedMedia, (filename) => `/api/organizations/${encodeURIComponent(organizationId)}/tourism/media/${filename}`);
  return rows.map(({ media: _media, includes, itinerary, routeNotes, importantInfo, departures, ...row }, index) => ({
    ...row,
    media: rewrittenMedia[index],
    includes: parseStringArray(includes),
    itinerary: parseStringArray(itinerary),
    routeNotes: parseStringArray(routeNotes),
    importantInfo: parseStringArray(importantInfo),
    departures,
  }));
}

const filters = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.enum(['DRAFT', 'REVIEW', 'OPEN', 'COMPLETED', 'CANCELLED', 'SOLD_OUT', 'CLOSED']).optional(),
  period: z.enum(['upcoming', 'past']).optional(),
}).strict();

// Dados essenciais de um rascunho. organizationId, status e publishedAt
// seguem fora: vêm sempre do contexto autenticado ou são fixos no servidor
// — campos fora desta lista são rejeitados pelo .strict(), nunca ignorados
// em silêncio.
const essentialTripFields = {
  title: z.string().trim().min(1, 'Título é obrigatório').max(200, 'Título longo demais'),
  category: z.string().trim().min(1, 'Categoria é obrigatória').max(80, 'Categoria longa demais'),
  description: z.string().trim().min(1, 'Descrição é obrigatória').max(5000, 'Descrição longa demais'),
  city: z.string().trim().min(1, 'Cidade é obrigatória').max(120, 'Cidade longa demais'),
  region: z.string().trim().min(1, 'Região é obrigatória').max(60, 'Região longa demais'),
  startDateISO: z.string().datetime({ offset: true, message: 'Data de início inválida (ISO 8601 com timezone)' }),
  endDateISO: z.string().datetime({ offset: true, message: 'Data de fim inválida (ISO 8601 com timezone)' }).nullable().optional(),
};

const nullableText = (max: number) => z.union([z.string().trim().max(max), z.literal(''), z.null()]).optional();
const stringList = (max: number, itemMax: number) => z.array(z.string().trim().min(1).max(itemMax)).max(max).optional();
// alt sempre obrigatório: toda foto de viagem da empresa vem do envio
// próprio (ver assertOwnedImages), nunca de um link externo sem descrição.
const mediaItem = z.object({
  src: z.string().trim().min(1).max(300),
  alt: z.string().trim().min(1, 'Descreva o que aparece na foto').max(300),
  focus: z.string().trim().max(80).optional(),
  type: z.enum(['image', 'video']).optional(),
}).strict();
const departureItem = z.object({
  time: z.string().trim().min(1, 'Horário é obrigatório').max(40),
  place: z.string().trim().min(1, 'Local é obrigatório').max(200),
  city: z.string().trim().min(1, 'Cidade é obrigatória').max(120),
  mapsUrl: z.union([z.string().trim().url().max(500), z.literal(''), z.null()]).optional(),
  mapsQuery: nullableText(300),
}).strict();

// Campos adicionais, todos opcionais: nunca buttonLabel/buttonClass/
// availabilitySchema (só importam quando publicada, o que esta rota nunca
// faz) nem includedServices (a própria tela legada já os mescla em includes
// antes de salvar).
const extendedTripFields = {
  headlineDisplay: nullableText(200),
  filterCategory: nullableText(80),
  departureTime: nullableText(20),
  departureTolerance: nullableText(80),
  returnTime: nullableText(20),
  scheduleInfo: nullableText(120),
  scheduleTBD: z.boolean().optional(),
  priceValue: z.number().min(0).max(1_000_000).nullable().optional(),
  priceDisplay: nullableText(120),
  priceUnit: z.string().trim().min(1).max(40).optional(),
  free: z.boolean().optional(),
  intensityClass: z.enum(['leve', 'moderado', 'intenso', 'extremo']).optional(),
  spotsLeft: z.number().int().min(0).max(100000).nullable().optional(),
  trailDistance: nullableText(120),
  supportPoint: nullableText(120),
  supportPointInfo: nullableText(2000),
  meetingCity: nullableText(120),
  meetingPoint: nullableText(200),
  meetingTBD: z.boolean().optional(),
  meetingDetails: nullableText(2000),
  meetingMapsQuery: nullableText(300),
  includes: stringList(50, 200),
  includesHighlight: nullableText(200),
  itinerary: stringList(100, 300),
  routeNotes: stringList(50, 300),
  importantInfo: stringList(50, 300),
  media: z.array(mediaItem).max(20).optional(),
  departures: z.array(departureItem).max(20).optional(),
};

const createSchema = z.object({ ...essentialTripFields, ...extendedTripFields }).strict();
const updateSchema = z.object({ ...z.object({ ...essentialTripFields, ...extendedTripFields }).partial().shape, expectedUpdatedAt: z.string().datetime({ offset: true }) }).strict()
  .refine(({ expectedUpdatedAt: _expectedUpdatedAt, ...changes }) => Object.keys(changes).length > 0, { message: 'Informe ao menos um campo para atualizar' });

// Agenda do painel: intervalo de datas (não paginação por página de
// resultado) para alimentar a grade mensal sem buscar a tabela inteira.
// Intervalo máximo e limite de resultados ficam fixos aqui (nunca vêm do
// cliente) para que a consulta permaneça sempre limitada.
const CALENDAR_MAX_RANGE_DAYS = 120;
const CALENDAR_MAX_RESULTS = 500;
const calendarRange = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inicial inválida (AAAA-MM-DD)'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data final inválida (AAAA-MM-DD)'),
}).strict();

router.get('/calendar', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const { start, end } = calendarRange.parse(req.query);
  const organizationId = req.organizationContext!.organization.id;
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
    throw AppError.badRequest('Intervalo de datas inválido');
  }
  const rangeDays = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
  if (rangeDays > CALENDAR_MAX_RANGE_DAYS) throw AppError.badRequest(`Intervalo máximo de ${CALENDAR_MAX_RANGE_DAYS} dias`);

  // Margem de 1 dia antes e 2 depois: cobre a leitura de cada viagem no fuso
  // local de quem a vê (ver tripDay/isoToLocalInput no painel — datas sem
  // hora valem pelo dia em UTC, com hora pelo dia local do navegador), sem
  // nunca buscar o calendário inteiro da empresa.
  const gte = new Date(startDate.getTime() - 86_400_000);
  const lt = new Date(endDate.getTime() + 2 * 86_400_000);
  const where: Prisma.TripWhereInput = { organizationId, startDateISO: { gte, lt } };

  const [trips, total] = await prisma.$transaction([
    prisma.trip.findMany({ where, select: listSelect, orderBy: [{ startDateISO: 'asc' }, { id: 'asc' }], take: CALENDAR_MAX_RESULTS }),
    prisma.trip.count({ where }),
  ]);
  // truncated nunca é escondido do cliente: se houver mais viagens que o
  // limite seguro, a página mostra isso em vez de recortar em silêncio.
  res.json({ data: trips, total, truncated: total > trips.length, range: { start, end } });
}));

router.get('/', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const { page, limit, search, status, period } = filters.parse(req.query);
  const organizationId = req.organizationContext!.organization.id;
  const clauses: Prisma.TripWhereInput[] = [{ organizationId }];
  if (status) clauses.push({ status });
  if (period) clauses.push(tripPeriodWhere(period));
  const matches = applySearchFilter(search, ['titleSearch', 'citySearch', 'categorySearch']);
  if (matches) clauses.push({ OR: matches });
  const where: Prisma.TripWhereInput = { AND: clauses };
  const [trips, total] = await prisma.$transaction([
    prisma.trip.findMany({ where, select: listSelect, orderBy: [{ startDateISO: period === 'upcoming' ? 'asc' : 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
    prisma.trip.count({ where }),
  ]);
  res.json({ data: trips, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}));

router.get('/:tripId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const id = z.string().min(1).max(128).parse(req.params.tripId);
  const organizationId = req.organizationContext!.organization.id;
  const trip = await prisma.trip.findFirst({ where: { id, organizationId }, select: detailSelect });
  if (!trip) throw AppError.notFound('Viagem não encontrada');
  const [presented] = await presentTrips(organizationId, [trip]);
  res.json(presented);
}));

router.post('/', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const data = createSchema.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;
  if (data.endDateISO && new Date(data.endDateISO) <= new Date(data.startDateISO)) {
    throw AppError.badRequest('A data de retorno deve ser depois da data de saída');
  }

  const trip = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
    // Só mídia já enviada e publicada por esta empresa (nunca link externo
    // ou arquivo de assets/ do site legado).
    const media = data.media ? await assertOwnedImages(tx, organizationId, data.media, true) : '[]';
    // free é só uma marcação de exibição (como na tela legada): o valor
    // digitado continua guardado mesmo com a viagem marcada como gratuita,
    // para não se perder se a marcação for desfeita depois.
    const free = data.free ?? false;
    // 128 bits aleatórios, nunca aceitos do cliente: só identifica o
    // registro para rastreabilidade, igual ao padrão já usado em mídia
    // (reserveStorageKey) e na operação legada (storedIdentity).
    const storedIdentity = `org-trip:${organizationId}:${randomBytes(16).toString('hex')}`;
    return tx.trip.create({
      data: {
        title: data.title,
        category: data.category,
        description: data.description,
        city: data.city,
        region: data.region,
        startDateISO: new Date(data.startDateISO),
        endDateISO: data.endDateISO ? new Date(data.endDateISO) : null,
        headlineDisplay: data.headlineDisplay || null,
        filterCategory: data.filterCategory || null,
        departureTime: data.departureTime || null,
        departureTolerance: data.departureTolerance || null,
        returnTime: data.returnTime || null,
        scheduleInfo: data.scheduleInfo || null,
        scheduleTBD: data.scheduleTBD ?? false,
        priceValue: data.priceValue ?? null,
        priceDisplay: data.priceDisplay || null,
        priceUnit: data.priceUnit?.trim() || 'por pessoa',
        free,
        intensityClass: data.intensityClass ?? 'moderado',
        spotsLeft: data.spotsLeft ?? null,
        trailDistance: data.trailDistance || null,
        supportPoint: data.supportPoint || null,
        supportPointInfo: data.supportPointInfo || null,
        meetingCity: data.meetingCity || null,
        meetingPoint: data.meetingPoint || null,
        meetingTBD: data.meetingTBD ?? false,
        meetingDetails: data.meetingDetails || null,
        meetingMapsQuery: data.meetingMapsQuery || null,
        includes: JSON.stringify(data.includes ?? []),
        includesHighlight: data.includesHighlight || null,
        itinerary: JSON.stringify(data.itinerary ?? []),
        routeNotes: JSON.stringify(data.routeNotes ?? []),
        importantInfo: JSON.stringify(data.importantInfo ?? []),
        media,
        // Sempre rascunho: só a operação legada publica, por ora. Nunca OPEN,
        // nunca publishedAt — mesmo que o cliente tentasse enviar um status
        // diferente, o .strict() do schema já rejeitaria a requisição inteira.
        status: 'DRAFT',
        storedIdentity,
        organizationId,
        titleSearch: normalizeForSearch(data.title),
        citySearch: normalizeForSearch(data.city),
        categorySearch: normalizeForSearch(data.category),
        ...(data.departures?.length ? { departures: { create: data.departures.map((d, index) => ({ time: d.time, place: d.place, city: d.city, mapsUrl: d.mapsUrl || null, mapsQuery: d.mapsQuery || null, orderIndex: index })) } } : {}),
      },
      select: detailSelect,
    });
  });
  const [presented] = await presentTrips(organizationId, [trip]);
  res.status(201).json(presented);
}));

router.put('/:tripId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const tripId = z.string().min(1).max(128).parse(req.params.tripId);
  const { expectedUpdatedAt, ...data } = updateSchema.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;

  const trip = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);

    const current = await tx.trip.findFirst({
      where: { id: tripId, organizationId, status: 'DRAFT' },
      select: { startDateISO: true, endDateISO: true, updatedAt: true },
    });
    // Não revela viagens de outra empresa nem permite editar status publicados.
    if (!current) throw AppError.notFound('Viagem não encontrada');
    if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw AppError.conflict('Esta viagem foi alterada por outra pessoa. Recarregue os dados antes de salvar.');
    }

    const nextStart = data.startDateISO ? new Date(data.startDateISO) : current.startDateISO;
    const nextEnd = data.endDateISO === undefined ? current.endDateISO : (data.endDateISO ? new Date(data.endDateISO) : null);
    if (nextEnd && nextEnd <= nextStart) throw AppError.badRequest('A data de retorno deve ser depois da data de saída');

    const media = data.media === undefined ? undefined : await assertOwnedImages(tx, organizationId, data.media, true);

    // A própria escrita exige id+organizationId (nunca só id): mesmo que
    // algo tivesse mudado entre a consulta acima e agora, esta instrução
    // nunca alteraria uma viagem de outra empresa.
    const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
    const { count } = await tx.trip.updateMany({
      where: { id: tripId, organizationId, status: 'DRAFT', updatedAt: current.updatedAt },
      data: {
        updatedAt,
        ...(data.title !== undefined ? { title: data.title, titleSearch: normalizeForSearch(data.title) } : {}),
        ...(data.category !== undefined ? { category: data.category, categorySearch: normalizeForSearch(data.category) } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.city !== undefined ? { city: data.city, citySearch: normalizeForSearch(data.city) } : {}),
        ...(data.region !== undefined ? { region: data.region } : {}),
        ...(data.startDateISO !== undefined ? { startDateISO: nextStart } : {}),
        ...(data.endDateISO !== undefined ? { endDateISO: nextEnd } : {}),
        ...(data.headlineDisplay !== undefined ? { headlineDisplay: data.headlineDisplay || null } : {}),
        ...(data.filterCategory !== undefined ? { filterCategory: data.filterCategory || null } : {}),
        ...(data.departureTime !== undefined ? { departureTime: data.departureTime || null } : {}),
        ...(data.departureTolerance !== undefined ? { departureTolerance: data.departureTolerance || null } : {}),
        ...(data.returnTime !== undefined ? { returnTime: data.returnTime || null } : {}),
        ...(data.scheduleInfo !== undefined ? { scheduleInfo: data.scheduleInfo || null } : {}),
        ...(data.scheduleTBD !== undefined ? { scheduleTBD: data.scheduleTBD } : {}),
        ...(data.free !== undefined ? { free: data.free } : {}),
        ...(data.priceValue !== undefined ? { priceValue: data.priceValue } : {}),
        ...(data.priceDisplay !== undefined ? { priceDisplay: data.priceDisplay || null } : {}),
        ...(data.priceUnit !== undefined ? { priceUnit: data.priceUnit } : {}),
        ...(data.intensityClass !== undefined ? { intensityClass: data.intensityClass } : {}),
        ...(data.spotsLeft !== undefined ? { spotsLeft: data.spotsLeft } : {}),
        ...(data.trailDistance !== undefined ? { trailDistance: data.trailDistance || null } : {}),
        ...(data.supportPoint !== undefined ? { supportPoint: data.supportPoint || null } : {}),
        ...(data.supportPointInfo !== undefined ? { supportPointInfo: data.supportPointInfo || null } : {}),
        ...(data.meetingCity !== undefined ? { meetingCity: data.meetingCity || null } : {}),
        ...(data.meetingPoint !== undefined ? { meetingPoint: data.meetingPoint || null } : {}),
        ...(data.meetingTBD !== undefined ? { meetingTBD: data.meetingTBD } : {}),
        ...(data.meetingDetails !== undefined ? { meetingDetails: data.meetingDetails || null } : {}),
        ...(data.meetingMapsQuery !== undefined ? { meetingMapsQuery: data.meetingMapsQuery || null } : {}),
        ...(data.includes !== undefined ? { includes: JSON.stringify(data.includes) } : {}),
        ...(data.includesHighlight !== undefined ? { includesHighlight: data.includesHighlight || null } : {}),
        ...(data.itinerary !== undefined ? { itinerary: JSON.stringify(data.itinerary) } : {}),
        ...(data.routeNotes !== undefined ? { routeNotes: JSON.stringify(data.routeNotes) } : {}),
        ...(data.importantInfo !== undefined ? { importantInfo: JSON.stringify(data.importantInfo) } : {}),
        ...(media !== undefined ? { media } : {}),
      },
    });
    if (count !== 1) throw AppError.conflict('Esta viagem foi alterada por outra pessoa. Recarregue os dados antes de salvar.');

    // Substitui a lista inteira de embarques, já confirmada pertencer a esta
    // viagem (tripId só chega até aqui depois do updateMany acima ter
    // confirmado id+organizationId): mesmo padrão usado pela tela legada,
    // que sempre reenvia a lista completa.
    if (data.departures !== undefined) {
      await tx.tripDeparture.deleteMany({ where: { tripId } });
      if (data.departures.length) {
        await tx.tripDeparture.createMany({ data: data.departures.map((d, index) => ({ tripId, time: d.time, place: d.place, city: d.city, mapsUrl: d.mapsUrl || null, mapsQuery: d.mapsQuery || null, orderIndex: index })) });
      }
    }
    return tx.trip.findFirst({ where: { id: tripId, organizationId }, select: detailSelect });
  });
  const [presented] = await presentTrips(organizationId, [trip!]);
  res.json(presented);
}));

// Única viagem que uma empresa pode excluir é a sua própria, e só enquanto
// rascunho (nunca chega a outro status por aqui — ver comentário em POST
// acima). Mesma defesa em duas camadas da exclusão legada
// (tripService.delete em src/services/index.ts): conta pelo próprio escopo
// (mensagem informativa) e pelo total sem filtro (detecta um vínculo que,
// por alguma inconsistência fora desta API, apontasse para outra empresa);
// a exclusão nunca é tentada quando as duas contagens não coincidem.
router.delete('/:tripId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const tripId = z.string().min(1).max(128).parse(req.params.tripId);
  const organizationId = req.organizationContext!.organization.id;

  await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);

    const trip = await tx.trip.findFirst({ where: { id: tripId, organizationId, status: 'DRAFT' }, select: { id: true } });
    if (!trip) throw AppError.notFound('Viagem não encontrada');

    const [ownReservations, ownLeads, ownVisits, ownGallery, totalReservations, totalLeads, totalVisits, totalGallery] = await Promise.all([
      tx.reservation.count({ where: { tripId, organizationId } }),
      tx.lead.count({ where: { tripId, organizationId } }),
      tx.visit.count({ where: { tripId, organizationId } }),
      tx.galleryEntry.count({ where: { tripId, organizationId } }),
      tx.reservation.count({ where: { tripId } }),
      tx.lead.count({ where: { tripId } }),
      tx.visit.count({ where: { tripId } }),
      tx.galleryEntry.count({ where: { tripId } }),
    ]);

    if (ownReservations > 0 || ownLeads > 0) {
      throw AppError.conflict('Não é possível excluir viagem com reservas ou interessados associados.', { reservations: ownReservations, leads: ownLeads });
    }
    if (ownVisits > 0 || ownGallery > 0) {
      throw AppError.badRequest('Não é possível excluir viagem com visitas ou memórias associadas. Remova as associações primeiro.', { visits: ownVisits, galleryEntries: ownGallery });
    }
    if (totalReservations > ownReservations || totalLeads > ownLeads || totalVisits > ownVisits || totalGallery > ownGallery) {
      throw AppError.conflict('Não é possível excluir viagem: existem registros vinculados.');
    }

    try {
      await tx.trip.delete({ where: { id: tripId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw AppError.conflict('Não é possível excluir viagem com registros associados.');
      }
      throw error;
    }
  });
  res.status(204).send();
}));

export default router;
