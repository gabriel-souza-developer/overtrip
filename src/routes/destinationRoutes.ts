import { Router, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { authorize, type AuthRequest } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { applySearchFilter, normalizeForSearch } from '../utils/searchUtils.js';
import { currentLegacyDestinationFilter, currentLegacyTourismFilter, currentLegacyVisitFilterWithConsistentTrip, legacyTourismOrganizationIdForNewRecord } from '../services/legacyTourismScope.js';
import { matchingDay, siteDay, syncDestinationsWithSite } from '../services/destinationSiteSync.js';
import { addDestinationAsStop, detachStop, findPrimary, linkOutingAsStop } from '../services/destinationTrips.js';
import {
  DESTINATION_CATEGORIES,
  DESTINATION_STATUSES,
  TRAIL_LEVELS,
  TRIP_LEVEL_FIELDS,
  dayToDate,
  effectiveOutingStatus,
  outingDay,
  todayInSaoPaulo,
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

// Paradas e principal sempre filtradas pelo escopo legado: um vínculo que
// cruze empresas (não criado por esta API) nunca expõe nome nem valores.
const inScope = (organizationId: string | null) => organizationId === null || organizationId === config.legacyTourismOrganizationId;
const placeSelect = { select: { id: true, name: true, organizationId: true } } as const;
const stopSelect = () => ({ where: { destination: { is: currentLegacyDestinationFilter() } }, select: { id: true, destination: placeSelect }, orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] });
const outingSelect = () => ({
  id: true, date: true, status: true, passengers: true, courtesySeats: true, pricePerPersonCents: true, transportCostCents: true, extraCostCents: true, supplier: true, notes: true, source: true, updatedAt: true,
  parentOutingId: true,
  parentOuting: { select: { id: true, date: true, status: true, source: true, destination: placeSelect, stops: stopSelect() } },
  stops: stopSelect(),
});
// Viagens e visitas do site ligadas ao destino, lidas sempre do registro
// original (nada é copiado): o que mudar no site aparece aqui também. Só os
// registros no escopo legado — nunca de outra empresa.
const visitSelect = { id: true, title: true, date: true, lat: true, lng: true, needsReview: true } as const;
const tripSelect = { id: true, title: true, startDateISO: true, status: true, priceValue: true, free: true, description: true, intensityClass: true, trailDistance: true } as const;
const destinationInclude = () => ({
  outings: { select: outingSelect(), orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] },
  visits: { where: currentLegacyVisitFilterWithConsistentTrip(), select: visitSelect, orderBy: [{ date: 'desc' }, { id: 'asc' }] },
  trips: { where: currentLegacyTourismFilter(), select: tripSelect, orderBy: [{ startDateISO: 'desc' }, { id: 'asc' }] },
}) satisfies Prisma.DestinationInclude;
type DestinationRow = Prisma.DestinationGetPayload<{ include: ReturnType<typeof destinationInclude> }>;

type OutingRow = DestinationRow['outings'][number];

/**
 * Viagem com vários destinos, vista a partir de uma das saídas: a principal
 * guarda status e valores; as paradas apontam para ela.
 */
const place = (destination: { id: string; name: string }) => ({ id: destination.id, name: destination.name });

function tripOf(row: DestinationRow, outing: OutingRow) {
  if (outing.parentOuting) {
    const primary = outing.parentOuting;
    // Principal fora do escopo: falha fechada, sem nomes nem valores.
    if (!inScope(primary.destination.organizationId)) return { role: 'stop' as const, primaryOutingId: null, primaryDestinationId: null, destinations: [] };
    return { role: 'stop' as const, primaryOutingId: primary.id, primaryDestinationId: primary.destination.id, primaryDate: primary.date, destinations: [place(primary.destination), ...primary.stops.map((stop) => place(stop.destination))] };
  }
  if (outing.stops.length) return { role: 'primary' as const, primaryOutingId: outing.id, primaryDestinationId: row.id, primaryDate: outing.date, destinations: [place(row), ...outing.stops.map((stop) => place(stop.destination))] };
  return null;
}

function presentOuting(row: DestinationRow, outing: OutingRow, siteDays: Set<string>) {
  const { parentOuting, stops: _stops, ...fields } = outing;
  // Uma parada segue a situação da principal e não tem valores próprios contados.
  const effective = parentOuting
    ? (inScope(parentOuting.destination.organizationId) ? effectiveOutingStatus(parentOuting) : { status: 'UNCONFIRMED' as const, confirmed: false })
    : effectiveOutingStatus(outing);
  const totals = parentOuting ? { revenueCents: null, expenseCents: null, resultCents: null } : outingTotals(outing);
  return {
    ...fields, ...totals,
    effectiveStatus: effective.status,
    statusConfirmed: effective.confirmed,
    trip: tripOf(row, outing),
    onSite: outing.date !== null && matchingDay(siteDays, outing.date.toISOString().slice(0, 10)) !== null,
  };
}

function present(row: DestinationRow) {
  const { organizationId: _organizationId, importKey, nameSearch: _nameSearch, citySearch: _citySearch, links, outings, visits, trips, ...rest } = row;
  const siteVisits = visits.map(({ lat, lng, needsReview, date, ...visit }) => ({ ...visit, date: date ? siteDay(date) : null, onMap: lat !== null && lng !== null && !needsReview }));
  const siteTrips = trips.map(({ startDateISO, priceValue, free, ...trip }) => ({ ...trip, date: siteDay(startDateISO), pricePerPersonCents: free ? 0 : priceValue != null ? Math.round(priceValue * 100) : null }));
  const siteDays = new Set([...siteVisits.map((visit) => visit.date), ...siteTrips.map((trip) => trip.date)].filter((day): day is string => day !== null));
  return {
    ...rest,
    imported: importKey !== null,
    links: parseStoredLinks(links),
    outings: outings.map((outing) => presentOuting(row, outing, siteDays)),
    // Médias do destino: sem saídas canceladas nem valores preservados de paradas.
    summary: summarizeOutings(outings.filter((outing) => effectiveOutingStatus(outing.parentOuting ?? outing).status !== 'CANCELLED').map((outing) => (outing.parentOuting ? { ...outing, passengers: null, pricePerPersonCents: null, transportCostCents: null, extraCostCents: null } : outing))),
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
  // Uma saída sem data pode ser um registro histórico importado. Uma saída
  // futura, por outro lado, ainda não torna o destino visitado.
  // Saída cancelada ou planejada não conta; parada segue a situação da
  // principal. Registros sem status já passados (inclusive os criados pelo
  // site, ainda a confirmar) ficam no histórico, onde a equipe os confere.
  const realized: Prisma.DestinationOutingWhereInput = { OR: [{ status: 'REALIZED' }, { status: null, OR: [{ date: null }, { date: { lte: new Date(`${todayInSaoPaulo()}T23:59:59.999Z`) } }] }] };
  const completedOuting: Prisma.DestinationOutingWhereInput = { OR: [{ parentOutingId: null, ...realized }, { parentOuting: { is: { ...realized, destination: { is: currentLegacyDestinationFilter() } } } }] };
  if (query.visited === 'true') clauses.push({ outings: { some: completedOuting } });
  if (query.visited === 'false') clauses.push({ outings: { none: completedOuting } });
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
  // Apagar a principal de uma viagem soltaria as paradas com os valores
  // antigos de volta nos totais: a equipe separa as paradas antes.
  // A condição vai no próprio DELETE (atômico): uma parada ligada entre a
  // checagem e a exclusão não escapa.
  // As saídas registradas vão junto (onDelete: Cascade); nenhum outro
  // registro (viagem, visita, reserva) referencia o banco de destinos.
  const { count } = await prisma.destination.deleteMany({ where: { ...scoped(id), outings: { none: { stops: { some: {} } } } } });
  if (count !== 1) {
    if (await prisma.destination.count({ where: scoped(id) })) throw AppError.conflict('Este destino guarda os valores de uma viagem com outros destinos. Separe as paradas dessa viagem antes de excluir.');
    throw AppError.notFound('Destino não encontrado');
  }
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

// Uma saída realizada não pode estar no futuro (o dia de hoje vale).
function validateStatus(status: string | null | undefined, date: Date | null | undefined) {
  if (status === 'REALIZED' && date && outingDay(date) > todayInSaoPaulo()) {
    throw AppError.badRequest('Uma saída com data futura não pode estar marcada como realizada.');
  }
}

function validateCourtesy(passengers: number | null | undefined, courtesySeats: number | null | undefined) {
  if (passengers != null && courtesySeats != null && courtesySeats > passengers) {
    throw AppError.badRequest('Cortesias não podem superar o total de passageiros.');
  }
}

// Toda mudança numa saída avança a versão do destino na mesma transação,
// para quem estiver com o formulário do destino aberto perceber a mudança.
async function touch(tx: Prisma.TransactionClient, destinationId: string, previous: Date) {
  await tx.destination.update({ where: { id: destinationId }, data: { updatedAt: new Date(Math.max(Date.now(), previous.getTime() + 1)) } });
}

router.post('/:id/outings', asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const data = outingCreateSchema.parse(req.body);
  validateCourtesy(data.passengers, data.courtesySeats);
  validateStatus(data.status, dayToDate(data.date));
  const row = await prisma.$transaction(async (tx) => {
    const destination = await findOwn(tx, id);
    await tx.destinationOuting.create({ data: { destinationId: id, ...outingData(data), source: 'TEAM' } });
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
    const existing = await tx.destinationOuting.findFirst({ where: { id: outingId, destinationId: id }, select: { passengers: true, courtesySeats: true, status: true, date: true, parentOutingId: true } });
    if (!existing) throw AppError.notFound('Saída não encontrada');
    if (existing.parentOutingId && TRIP_LEVEL_FIELDS.some((field) => data[field] !== undefined)) {
      throw AppError.badRequest('Esta saída é uma parada de uma viagem com vários destinos: situação e valores ficam na saída principal.');
    }
    validateCourtesy(data.passengers === undefined ? existing.passengers : data.passengers, data.courtesySeats === undefined ? existing.courtesySeats : data.courtesySeats);
    validateStatus(data.status === undefined ? existing.status : data.status, data.date === undefined ? existing.date : dayToDate(data.date));
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
    const { count } = await tx.destinationOuting.deleteMany({ where: { id: outingId, destinationId: id, stops: { none: {} } } });
    if (count !== 1) {
      if (await tx.destinationOuting.count({ where: { id: outingId, destinationId: id } })) throw AppError.conflict('Esta saída guarda os valores de uma viagem com outros destinos. Separe as paradas antes de excluir.');
      throw AppError.notFound('Saída não encontrada');
    }
    await touch(tx, id, destination.updatedAt);
    return findOwn(tx, id);
  });
  res.json(present(row));
}));

// ── Viagem com vários destinos ──────────────────────────────────────────
// A saída do destino :id é a principal; paradas são saídas de outros
// destinos ligadas a ela (regras em services/destinationTrips.ts).
const stopCreateSchema = z.union([
  z.object({ outingId: idSchema }).strict(),
  z.object({ destinationId: idSchema }).strict(),
]);

router.post('/:id/outings/:outingId/stops', asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const outingId = idSchema.parse(req.params.outingId);
  const body = stopCreateSchema.parse(req.body);
  const row = await prisma.$transaction(async (tx) => {
    const destination = await findOwn(tx, id);
    const primary = await findPrimary(tx, outingId, id);
    const stop = 'outingId' in body ? await linkOutingAsStop(tx, primary, body.outingId) : await addDestinationAsStop(tx, primary, body.destinationId);
    await touch(tx, id, destination.updatedAt);
    await touch(tx, stop.destinationId, stop.previousUpdatedAt);
    return findOwn(tx, id);
  });
  res.status(201).json(present(row));
}));

router.delete('/:id/outings/:outingId/stops/:stopId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const outingId = idSchema.parse(req.params.outingId);
  const stopId = idSchema.parse(req.params.stopId);
  const row = await prisma.$transaction(async (tx) => {
    const destination = await findOwn(tx, id);
    const stop = await detachStop(tx, await findPrimary(tx, outingId, id), stopId);
    await touch(tx, id, destination.updatedAt);
    await touch(tx, stop.destinationId, stop.previousUpdatedAt);
    return findOwn(tx, id);
  });
  res.json(present(row));
}));

export default router;
