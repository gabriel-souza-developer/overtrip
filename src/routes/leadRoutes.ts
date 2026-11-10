import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
// Interested-party contact information is private and only available to administrators.
router.use(authenticate, authorize('admin'));
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

const stage = z.enum(['NEW', 'CONTACTED', 'NEGOTIATING', 'WON', 'LOST']);
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const leadInput = z.object({
  name: z.string().trim().min(1).max(120),
  phone: nullableText(40),
  email: z.union([z.email().max(254), z.literal(''), z.null()]).optional(),
  stage: stage.optional(),
  tripId: nullableText(100),
  responsible: nullableText(120),
  nextFollowUpAt: z.union([z.iso.datetime({ offset: true }), z.null()]).optional(),
  notes: nullableText(3000),
}).strict();
const updateInput = leadInput.partial();
const filters = z.object({
  stage: stage.optional(),
  tripId: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
const include = { trip: { select: { id: true, title: true } } } as const;
const clean = <T extends Record<string, unknown>>(data: T) => Object.fromEntries(
  Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
);

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, stage: currentStage, tripId } = filters.parse(req.query);
  const where = { ...(currentStage ? { stage: currentStage } : {}), ...(tripId ? { tripId } : {}) };
  const [data, total] = await prisma.$transaction([
    prisma.lead.findMany({ where, include, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
    prisma.lead.count({ where }),
  ]);
  res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const item = await prisma.lead.findUnique({ where: { id: req.params.id }, include: { ...include, events: { orderBy: { createdAt: 'desc' }, take: 100 } } });
  if (!item) throw AppError.notFound('Interessado não encontrado');
  res.json(item);
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const input = leadInput.parse(req.body);
  const item = await prisma.lead.create({ data: { ...clean(input), name: input.name, nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null }, include });
  res.status(201).json(item);
}));

router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const input = updateInput.parse(req.body);
  if (!Object.keys(input).length) throw AppError.badRequest('Informe ao menos um campo');
  const data = { ...clean(input), ...(input.nextFollowUpAt !== undefined ? { nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null } : {}) };
  const item = await prisma.lead.update({ where: { id: req.params.id }, data, include });
  res.json(item);
}));

router.post('/:id/events', asyncHandler(async (req: Request, res: Response) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).strict().parse(req.body);
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!lead) throw AppError.notFound('Interessado não encontrado');
  const event = await prisma.leadEvent.create({ data: { leadId: lead.id, body } });
  res.status(201).json(event);
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await prisma.lead.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

export default router;
