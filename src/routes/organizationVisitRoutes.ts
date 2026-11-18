import { Router, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { requireOrganizationMembership, type OrganizationRequest } from '../middleware/organizationContext.js';
import { applySearchFilter } from '../utils/searchUtils.js';

const router = Router({ mergeParams: true });
router.use(requireOrganizationMembership());

// Todos os membros podem consultar os mesmos campos operacionais, sem notas,
// imagens privadas ou relações cujo titular seja outra empresa.
const select = { id: true, title: true, description: true, date: true, city: true, region: true, lat: true, lng: true, needsReview: true } as const;
const filters = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  needsReview: z.enum(['true', 'false']).optional(),
  hasCoords: z.enum(['true', 'false']).optional(),
}).strict();

const ownVisit = (organizationId: string): Prisma.VisitWhereInput => ({
  organizationId,
  OR: [{ tripId: null }, { trip: { is: { organizationId } } }],
});

router.get('/', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const query = filters.parse(req.query);
  const organizationId = req.organizationContext!.organization.id;
  const clauses: Prisma.VisitWhereInput[] = [ownVisit(organizationId)];
  if (query.needsReview) clauses.push({ needsReview: query.needsReview === 'true' });
  if (query.hasCoords === 'true') clauses.push({ lat: { not: null }, lng: { not: null } });
  if (query.hasCoords === 'false') clauses.push({ OR: [{ lat: null }, { lng: null }] });
  const matches = applySearchFilter(query.search, ['titleSearch', 'citySearch', 'regionSearch']);
  if (matches) clauses.push({ OR: matches });
  const where: Prisma.VisitWhereInput = { AND: clauses };
  const [data, total] = await prisma.$transaction([
    prisma.visit.findMany({ where, select, orderBy: [{ date: 'desc' }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.visit.count({ where }),
  ]);
  res.json({ data, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } });
}));

router.get('/:visitId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const id = z.string().min(1).max(128).parse(req.params.visitId);
  const visit = await prisma.visit.findFirst({ where: { id, ...ownVisit(req.organizationContext!.organization.id) }, select });
  if (!visit) throw AppError.notFound('Destino não encontrado');
  res.json(visit);
}));

export default router;
