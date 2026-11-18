import { randomBytes } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { assertOrganizationWriteAccess, requireOrganizationMembership, type OrganizationRequest } from '../middleware/organizationContext.js';
import { applySearchFilter, normalizeForSearch } from '../utils/searchUtils.js';
import { tripPeriodWhere } from '../utils/tripPeriod.js';

// The parent router authenticates first. No legacy routes, media or related
// global records are exposed here during the ownership migration.
const router = Router({ mergeParams: true });
router.use(requireOrganizationMembership());
const select = { id: true, title: true, category: true, description: true, city: true, region: true, startDateISO: true, endDateISO: true, status: true, updatedAt: true } as const;

const filters = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.enum(['DRAFT', 'REVIEW', 'OPEN', 'COMPLETED', 'CANCELLED', 'SOLD_OUT', 'CLOSED']).optional(),
  period: z.enum(['upcoming', 'past']).optional(),
}).strict();

// Só os dados essenciais de um rascunho: nunca organizationId, status,
// mídia, preço ou qualquer relação de cliente (lead/reserva) — campos que
// não constam aqui são rejeitados pelo .strict(), nunca ignorados em
// silêncio. organizationId vem sempre do contexto autenticado (parâmetro da
// rota + vínculo revalidado), nunca do corpo da requisição.
const essentialTripFields = {
  title: z.string().trim().min(1, 'Título é obrigatório').max(200, 'Título longo demais'),
  category: z.string().trim().min(1, 'Categoria é obrigatória').max(80, 'Categoria longa demais'),
  description: z.string().trim().min(1, 'Descrição é obrigatória').max(5000, 'Descrição longa demais'),
  city: z.string().trim().min(1, 'Cidade é obrigatória').max(120, 'Cidade longa demais'),
  region: z.string().trim().min(1, 'Região é obrigatória').max(60, 'Região longa demais'),
  startDateISO: z.string().datetime({ offset: true, message: 'Data de início inválida (ISO 8601 com timezone)' }),
  endDateISO: z.string().datetime({ offset: true, message: 'Data de fim inválida (ISO 8601 com timezone)' }).nullable().optional(),
};
const createSchema = z.object(essentialTripFields).strict();
const updateSchema = z.object({ ...z.object(essentialTripFields).partial().shape, expectedUpdatedAt: z.string().datetime({ offset: true }) }).strict()
  .refine(({ expectedUpdatedAt: _expectedUpdatedAt, ...changes }) => Object.keys(changes).length > 0, { message: 'Informe ao menos um campo para atualizar' });

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
    prisma.trip.findMany({ where, select, orderBy: [{ startDateISO: period === 'upcoming' ? 'asc' : 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
    prisma.trip.count({ where }),
  ]);
  res.json({ data: trips, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}));

router.get('/:tripId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const id = z.string().min(1).max(128).parse(req.params.tripId);
  const trip = await prisma.trip.findFirst({ where: { id, organizationId: req.organizationContext!.organization.id }, select });
  if (!trip) throw AppError.notFound('Viagem não encontrada');
  res.json(trip);
}));

router.post('/', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const data = createSchema.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;
  if (data.endDateISO && new Date(data.endDateISO) <= new Date(data.startDateISO)) {
    throw AppError.badRequest('A data de retorno deve ser depois da data de saída');
  }

  const trip = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
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
        // Sempre rascunho: só a operação legada publica, por ora. Nunca OPEN,
        // nunca publishedAt — mesmo que o cliente tentasse enviar um status
        // diferente, o .strict() do schema já rejeitaria a requisição inteira.
        status: 'DRAFT',
        intensityClass: 'moderado',
        includes: '[]',
        media: '[]',
        storedIdentity,
        organizationId,
        titleSearch: normalizeForSearch(data.title),
        citySearch: normalizeForSearch(data.city),
        categorySearch: normalizeForSearch(data.category),
      },
      select,
    });
  });
  res.status(201).json(trip);
}));

router.put('/:tripId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const tripId = z.string().min(1).max(128).parse(req.params.tripId);
  const { expectedUpdatedAt, ...data } = updateSchema.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;

  const trip = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);

    const current = await tx.trip.findFirst({ where: { id: tripId, organizationId, status: 'DRAFT' }, select: { startDateISO: true, endDateISO: true, updatedAt: true } });
    // Não revela viagens de outra empresa nem permite editar status publicados.
    if (!current) throw AppError.notFound('Viagem não encontrada');
    if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw AppError.conflict('Esta viagem foi alterada por outra pessoa. Recarregue os dados antes de salvar.');
    }

    const nextStart = data.startDateISO ? new Date(data.startDateISO) : current.startDateISO;
    const nextEnd = data.endDateISO === undefined ? current.endDateISO : (data.endDateISO ? new Date(data.endDateISO) : null);
    if (nextEnd && nextEnd <= nextStart) throw AppError.badRequest('A data de retorno deve ser depois da data de saída');

    // A própria escrita exige id+organizationId (nunca só id): mesmo que
    // algo tivesse mudado entre a consulta acima e agora, esta instrução
    // nunca alteraria uma viagem de outra empresa.
    const { count } = await tx.trip.updateMany({
      where: { id: tripId, organizationId, status: 'DRAFT', updatedAt: current.updatedAt },
      data: {
        updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
        ...(data.title !== undefined ? { title: data.title, titleSearch: normalizeForSearch(data.title) } : {}),
        ...(data.category !== undefined ? { category: data.category, categorySearch: normalizeForSearch(data.category) } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.city !== undefined ? { city: data.city, citySearch: normalizeForSearch(data.city) } : {}),
        ...(data.region !== undefined ? { region: data.region } : {}),
        ...(data.startDateISO !== undefined ? { startDateISO: nextStart } : {}),
        ...(data.endDateISO !== undefined ? { endDateISO: nextEnd } : {}),
      },
    });
    if (count !== 1) throw AppError.conflict('Esta viagem foi alterada por outra pessoa. Recarregue os dados antes de salvar.');
    return tx.trip.findFirst({ where: { id: tripId, organizationId }, select });
  });
  res.json(trip);
}));

export default router;
