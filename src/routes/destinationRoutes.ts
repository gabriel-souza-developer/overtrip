import { Router, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authorize, type AuthRequest } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { applySearchFilter, normalizeForSearch } from '../utils/searchUtils.js';
import { currentLegacyDestinationFilter, currentLegacyTourismFilter, currentLegacyVisitFilterWithConsistentTrip, legacyTourismOrganizationIdForNewRecord } from '../services/legacyTourismScope.js';
import { matchingDay, siteDay, syncDestinationsWithSite } from '../services/destinationSiteSync.js';
import {
  DESTINATION_CATEGORIES,
  DESTINATION_STATUSES,
  TRAIL_LEVELS,
  dayToDate,
  destinationFields,
  outingFields,
  outingTotals,
  parseStoredLinks,
  summarizeOutings,
} from '../services/destinationBank.js';

// Banco PRIVADO de destinos do painel OVERTRIP (montado atrás do legacyGate
// em app.ts). Só administradores: há custos de transporte, fornecedores e
// resultado de cada saída. Nada daqui é lido pelo site, assistente ou rotas
// públicas.
const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(authorize('admin'));

const idSchema = z.string().min(1).max(128);
const filters = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().max(200).optional(),
  status: z.enum(DESTINATION_STATUSES).optional(),
  category: z.enum(DESTINATION_CATEGORIES).optional(),
  trailLevel: z.enum(TRAIL_LEVELS).optional(),
  visited: z.enum(['true', 'false']).optional(),
  maxDistanceKm: z.coerce.number().int().min(0).max(20000).optional(),
  onMap: z.enum(['true', 'false']).optional(),
  sort: z.enum(['name', 'distance', 'recent']).default('name'),
}).strict();

const outingSelect = { id: true, date: true, passengers: true, pricePerPersonCents: true, transportCostCents: true, extraCostCents: true, supplier: true, notes: true, updatedAt: true } as const;
// Viagens e visitas do site ligadas ao destino, lidas sempre do registro
// original (nada é copiado): o que mudar no site aparece aqui também. Só os
// registros no escopo legado — nunca de outra empresa.
const visitSelect = { id: true, title: true, date: true, lat: true, lng: true, needsReview: true } as const;
const tripSelect = { id: true, title: true, startDateISO: true, status: true, priceValue: true, free: true, description: true, intensityClass: true, trailDistance: true } as const;
const destinationInclude = () => ({
  outings: { select: outingSelect, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] },
  visits: { where: currentLegacyVisitFilterWithConsistentTrip(), select: visitSelect, orderBy: [{ date: 'desc' }, { id: 'asc' }] },
  trips: { where: currentLegacyTourismFilter(), select: tripSelect, orderBy: [{ startDateISO: 'desc' }, { id: 'asc' }] },
}) satisfies Prisma.DestinationInclude;
type DestinationRow = Prisma.DestinationGetPayload<{ include: ReturnType<typeof destinationInclude> }>;

function present(row: DestinationRow) {
  const { organizationId: _organizationId, importKey, nameSearch: _nameSearch, citySearch: _citySearch, links, outings, visits, trips, ...rest } = row;
  const siteVisits = visits.map(({ lat, lng, needsReview, date, ...visit }) => ({ ...visit, date: date ? siteDay(date) : null, onMap: lat !== null && lng !== null && !needsReview }));
  const siteTrips = trips.map(({ startDateISO, priceValue, free, ...trip }) => ({ ...trip, date: siteDay(startDateISO), pricePerPersonCents: free ? 0 : priceValue != null ? Math.round(priceValue * 100) : null }));
  const siteDays = new Set([...siteVisits.map((visit) => visit.date), ...siteTrips.map((trip) => trip.date)].filter((day): day is string => day !== null));
  return {
    ...rest,
    imported: importKey !== null,
    links: parseStoredLinks(links),
    outings: outings.map((outing) => ({ ...outing, ...outingTotals(outing), onSite: outing.date !== null && matchingDay(siteDays, outing.date.toISOString().slice(0, 10)) !== null })),
    summary: summarizeOutings(outings),
    site: { onMap: siteVisits.some((visit) => visit.onMap), visits: siteVisits, trips: siteTrips },
  };
}

const scoped = (id: string): Prisma.DestinationWhereInput => ({ id, ...currentLegacyDestinationFilter() });

async function findOwn(tx: Pick<Prisma.TransactionClient, 'destination'>, id: string) {
  const row = await tx.destination.findFirst({ where: scoped(id), include: destinationInclude() });
  if (!row) throw AppError.notFound('Destino não encontrado');
  return row;
}

router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = filters.parse(req.query);
  const clauses: Prisma.DestinationWhereInput[] = [currentLegacyDestinationFilter()];
  if (query.status) clauses.push({ status: query.status });
  if (query.category) clauses.push({ category: query.category });
  if (query.trailLevel) clauses.push({ trailLevel: query.trailLevel });
  if (query.visited === 'true') clauses.push({ outings: { some: {} } });
  if (query.visited === 'false') clauses.push({ outings: { none: {} } });
  const mapVisit: Prisma.VisitWhereInput = { AND: [currentLegacyVisitFilterWithConsistentTrip(), { lat: { not: null }, lng: { not: null }, needsReview: false }] };
  if (query.onMap === 'true') clauses.push({ visits: { some: mapVisit } });
  if (query.onMap === 'false') clauses.push({ visits: { none: mapVisit } });
  if (query.maxDistanceKm !== undefined) clauses.push({ distanceKm: { lte: query.maxDistanceKm } });
  const matches = applySearchFilter(query.search, ['nameSearch', 'citySearch']);
  if (matches) clauses.push({ OR: matches });
  const where: Prisma.DestinationWhereInput = { AND: clauses };
  const orderBy: Prisma.DestinationOrderByWithRelationInput[] = query.sort === 'distance'
    ? [{ distanceKm: { sort: 'asc', nulls: 'last' } }, { nameSearch: 'asc' }]
    : query.sort === 'recent' ? [{ updatedAt: 'desc' }, { id: 'asc' }] : [{ nameSearch: 'asc' }, { id: 'asc' }];
  const [rows, total] = await prisma.$transaction([
    prisma.destination.findMany({ where, include: destinationInclude(), orderBy, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.destination.count({ where }),
  ]);
  res.json({ data: rows.map(present), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } });
}));

// Liga viagens e visitas do site aos destinos (ver destinationSiteSync.ts).
router.post('/sync-site', asyncHandler(async (_req: AuthRequest, res: Response) => {
  const report = await prisma.$transaction((tx) => syncDestinationsWithSite(tx), { timeout: 30000 });
  res.json(report);
}));

router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const row = await findOwn(prisma, idSchema.parse(req.params.id));
  res.json(present(row));
}));

const createSchema = z.object(destinationFields).strict();
const updateSchema = z.object({ ...z.object(destinationFields).partial().shape, expectedUpdatedAt: z.string().datetime({ offset: true }) }).strict()
  .refine(({ expectedUpdatedAt: _expected, ...changes }) => Object.keys(changes).length > 0, { message: 'Informe ao menos um campo para atualizar' });

router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = createSchema.parse(req.body);
  const created = await prisma.destination.create({
    data: {
      name: data.name,
      city: data.city ?? null,
      region: data.region ?? null,
      category: data.category ?? null,
      status: data.status ?? 'IDEA',
      originCity: data.originCity ?? null,
      distanceKm: data.distanceKm ?? null,
      trailLevel: data.trailLevel ?? null,
      bestSeason: data.bestSeason ?? null,
      notes: data.notes ?? null,
      links: JSON.stringify(data.links ?? []),
      organizationId: legacyTourismOrganizationIdForNewRecord(),
      nameSearch: normalizeForSearch(data.name),
      citySearch: normalizeForSearch(data.city ?? ''),
    },
    include: destinationInclude(),
  });
  res.status(201).json(present(created));
}));

router.put('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const { expectedUpdatedAt, links, ...data } = updateSchema.parse(req.body);
  const row = await prisma.$transaction(async (tx) => {
    const current = await findOwn(tx, id);
    const conflict = () => AppError.conflict('Este destino foi alterado por outra pessoa. Recarregue os dados antes de salvar.');
    if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) throw conflict();
    const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
    const changes: Prisma.DestinationUpdateManyMutationInput = { updatedAt };
    for (const [key, value] of Object.entries(data)) if (value !== undefined) (changes as Record<string, unknown>)[key] = value;
    if (data.name !== undefined) changes.nameSearch = normalizeForSearch(data.name);
    if (data.city !== undefined) changes.citySearch = normalizeForSearch(data.city ?? '');
    if (links !== undefined) changes.links = JSON.stringify(links);
    const { count } = await tx.destination.updateMany({ where: { ...scoped(id), updatedAt: current.updatedAt }, data: changes });
    if (count !== 1) throw conflict();
    return findOwn(tx, id);
  });
  res.json(present(row));
}));

router.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = idSchema.parse(req.params.id);
  // As saídas registradas vão junto (onDelete: Cascade); nenhum outro
  // registro (viagem, visita, reserva) referencia o banco de destinos.
  const { count } = await prisma.destination.deleteMany({ where: scoped(id) });
  if (count !== 1) throw AppError.notFound('Destino não encontrado');
  res.status(204).send();
}));

// ── Saídas realizadas ────────────────────────────────────────────────────
const outingCreateSchema = z.object(outingFields).strict();
const outingUpdateSchema = z.object(outingFields).strict().refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos um campo para atualizar' });

function outingData(data: z.infer<typeof outingCreateSchema>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    result[key] = key === 'date' ? dayToDate(value as string | null) : value;
  }
  return result;
}

// Toda mudança numa saída avança a versão do destino na mesma transação,
// para quem estiver com o formulário do destino aberto perceber a mudança.
async function touch(tx: Prisma.TransactionClient, destinationId: string, previous: Date) {
  await tx.destination.update({ where: { id: destinationId }, data: { updatedAt: new Date(Math.max(Date.now(), previous.getTime() + 1)) } });
}

router.post('/:id/outings', asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const data = outingCreateSchema.parse(req.body);
  const row = await prisma.$transaction(async (tx) => {
    const destination = await findOwn(tx, id);
    await tx.destinationOuting.create({ data: { destinationId: id, ...outingData(data) } });
    await touch(tx, id, destination.updatedAt);
    return findOwn(tx, id);
  });
  res.status(201).json(present(row));
}));

router.put('/:id/outings/:outingId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const outingId = idSchema.parse(req.params.outingId);
  const data = outingUpdateSchema.parse(req.body);
  const row = await prisma.$transaction(async (tx) => {
    const destination = await findOwn(tx, id);
    const { count } = await tx.destinationOuting.updateMany({ where: { id: outingId, destinationId: id }, data: outingData(data) });
    if (count !== 1) throw AppError.notFound('Saída não encontrada');
    await touch(tx, id, destination.updatedAt);
    return findOwn(tx, id);
  });
  res.json(present(row));
}));

router.delete('/:id/outings/:outingId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const outingId = idSchema.parse(req.params.outingId);
  const row = await prisma.$transaction(async (tx) => {
    const destination = await findOwn(tx, id);
    const { count } = await tx.destinationOuting.deleteMany({ where: { id: outingId, destinationId: id } });
    if (count !== 1) throw AppError.notFound('Saída não encontrada');
    await touch(tx, id, destination.updatedAt);
    return findOwn(tx, id);
  });
  res.json(present(row));
}));

export default router;
