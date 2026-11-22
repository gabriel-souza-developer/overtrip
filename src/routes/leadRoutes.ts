import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
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
  eligibleTripId: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().max(120).optional(),
  followUp: z.enum(['due']).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
const include = { trip: { select: { id: true, title: true } } } as const;
const businessTimeZone = 'America/Sao_Paulo';

function zonedMidnightUtc(year: number, month: number, day: number): Date {
  const targetAsUtc = Date.UTC(year, month - 1, day);
  let instant = targetAsUtc;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: businessTimeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  // Resolve the UTC instant that corresponds to midnight in the business zone.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const renderedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const offset = renderedAsUtc - instant;
    const adjusted = targetAsUtc - offset;
    if (adjusted === instant) break;
    instant = adjusted;
  }
  return new Date(instant);
}

function startOfTomorrowInBusinessZone(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: businessTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return zonedMidnightUtc(Number(values.year), Number(values.month), Number(values.day) + 1);
}
const clean = <T extends Record<string, unknown>>(data: T) => Object.fromEntries(
  Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
);

// SQLite lower() only folds ASCII. Fold the uppercase accented letters used
// in Portuguese explicitly; preserve accents and literal substring semantics.
const portugueseCaseFold = (value: Prisma.Sql): Prisma.Sql => {
  const pairs = [['Á', 'á'], ['À', 'à'], ['Â', 'â'], ['Ã', 'ã'], ['Ä', 'ä'], ['É', 'é'], ['È', 'è'], ['Ê', 'ê'], ['Ë', 'ë'], ['Í', 'í'], ['Ì', 'ì'], ['Î', 'î'], ['Ï', 'ï'], ['Ó', 'ó'], ['Ò', 'ò'], ['Ô', 'ô'], ['Õ', 'õ'], ['Ö', 'ö'], ['Ú', 'ú'], ['Ù', 'ù'], ['Û', 'û'], ['Ü', 'ü'], ['Ç', 'ç']] as const;
  return Prisma.sql`lower(${pairs.reduce((expression, [upper, lower]) => Prisma.sql`replace(${expression}, ${upper}, ${lower})`, value)})`;
};

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, stage: currentStage, tripId, eligibleTripId, search, followUp } = filters.parse(req.query);
  const where = {
    ...(currentStage ? { stage: currentStage } : {}),
    ...(tripId ? { tripId } : {}),
    AND: [
      ...(eligibleTripId ? [{ OR: [{ tripId: eligibleTripId }, { tripId: null }] }] : []),
    ],
    ...(followUp === 'due' ? { nextFollowUpAt: { not: null, lt: startOfTomorrowInBusinessZone() } } : {}),
  };
  const orderBy = followUp === 'due'
    ? [{ nextFollowUpAt: 'asc' as const }, { updatedAt: 'desc' as const }, { id: 'asc' as const }]
    : [{ updatedAt: 'desc' as const }, { id: 'asc' as const }];
  // Prisma's SQLite `contains` uses LIKE, so '%' and '_' otherwise become
  // wildcards. instr performs literal matching, with every value parameterized.
  // Page, count and hydration share a snapshot; only page-sized IDs enter JS.
  const [data, total] = search ? await prisma.$transaction(async tx => {
    const term = portugueseCaseFold(Prisma.sql`${search}`);
    const clauses = [Prisma.sql`(instr(${portugueseCaseFold(Prisma.sql`"name"`)}, ${term}) > 0 OR instr(${portugueseCaseFold(Prisma.sql`COALESCE("phone", '')`)}, ${term}) > 0 OR instr(${portugueseCaseFold(Prisma.sql`COALESCE("email", '')`)}, ${term}) > 0)`];
    if (currentStage) clauses.push(Prisma.sql`"stage" = ${currentStage}`);
    if (tripId) clauses.push(Prisma.sql`"tripId" = ${tripId}`);
    if (eligibleTripId) clauses.push(Prisma.sql`("tripId" = ${eligibleTripId} OR "tripId" IS NULL)`);
    if (followUp === 'due') clauses.push(Prisma.sql`"nextFollowUpAt" IS NOT NULL AND "nextFollowUpAt" < ${startOfTomorrowInBusinessZone().getTime()}`);
    const condition = Prisma.join(clauses, ' AND ');
    const order = followUp === 'due' ? Prisma.sql`"nextFollowUpAt" ASC, "updatedAt" DESC, "id" ASC` : Prisma.sql`"updatedAt" DESC, "id" ASC`;
    const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT "id" FROM "Lead" WHERE ${condition} ORDER BY ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`);
    const count = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS "total" FROM "Lead" WHERE ${condition}`);
    const rows = await tx.lead.findMany({ where: { id: { in: ids.map(item => item.id) } }, include, orderBy });
    return [rows, Number(count[0].total)] as const;
  }) : await prisma.$transaction([
    prisma.lead.findMany({ where, include, orderBy, skip: (page - 1) * limit, take: limit }),
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
  const item = await prisma.$transaction(async (tx) => {
    if (input.tripId) {
      const conflicting = await tx.reservation.findFirst({ where: { leadId: req.params.id, tripId: { not: input.tripId } }, select: { id: true } });
      if (conflicting) throw AppError.conflict('Este interessado possui reserva vinculada a outra viagem.');
    }
    return tx.lead.update({ where: { id: req.params.id }, data, include });
  });
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
  await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({ where: { leadId: req.params.id }, select: { id: true } });
    if (reservation) throw AppError.conflict('Desvincule as reservas deste interessado antes de excluí-lo.');
    await tx.lead.delete({ where: { id: req.params.id } });
  });
  res.status(204).end();
}));

export default router;
