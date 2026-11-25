import { Router, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganizationFromHeader, type OrganizationRequest } from '../middleware/organizationContext.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.use(authenticate, requireOrganizationFromHeader('OWNER', 'ADMIN', 'MEMBER'));
router.use((req: OrganizationRequest, _res, next) => {
  if (req.organizationContext?.organization.niche !== 'pousada') { next(AppError.forbidden('Este módulo é exclusivo de pousadas.')); return; }
  next();
});

const identifier = z.string().trim().min(1).max(128);
const unitInput = z.object({ name: z.string().trim().min(1).max(120) }).strict();
const reservationInput = z.object({
  unitId: identifier,
  guestName: z.string().trim().min(1).max(150),
  checkIn: z.iso.date(),
  checkOut: z.iso.date(),
}).strict();
const blockInput = z.object({
  unitId: identifier,
  start: z.iso.date(),
  end: z.iso.date(),
  reason: z.string().trim().max(200).nullable().optional(),
}).strict();
const unitSelect = { id: true, name: true, createdAt: true } as const;
const reservationInclude = { unit: { select: { id: true, name: true } } } as const;
const pageValue = z.string().regex(/^[1-9]\d{0,4}$/).transform(Number);
const limitValue = z.string().regex(/^[1-9]\d?$/).transform(Number).refine(value => value <= 50);
const paging = { page: pageValue.optional(), limit: limitValue.optional() };
const status = z.enum(['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED']);
const paginated = (page: number, limit: number, total: number) => ({ page, limit, total, totalPages: Math.ceil(total / limit) });
// SQLite lower() folds ASCII only. Fold common Portuguese uppercase accents too;
// accents remain meaningful and decomposed Unicode is not normalized.
const fold = (value: Prisma.Sql) => {
  const pairs = [['Á','á'],['À','à'],['Â','â'],['Ã','ã'],['Ä','ä'],['É','é'],['È','è'],['Ê','ê'],['Ë','ë'],['Í','í'],['Ì','ì'],['Î','î'],['Ï','ï'],['Ó','ó'],['Ò','ò'],['Ô','ô'],['Õ','õ'],['Ö','ö'],['Ú','ú'],['Ù','ù'],['Û','û'],['Ü','ü'],['Ç','ç']] as const;
  return Prisma.sql`lower(${pairs.reduce((expr, [upper, lower]) => Prisma.sql`replace(${expr}, ${upper}, ${lower})`, value)})`;
};

/** A saída é exclusiva, de modo que uma nova chegada pode ocorrer no mesmo dia. */
function occupiedNights(checkIn: string, checkOut: string): string[] {
  const start = Date.parse(`${checkIn}T00:00:00.000Z`);
  const end = Date.parse(`${checkOut}T00:00:00.000Z`);
  const count = (end - start) / 86_400_000;
  if (!Number.isInteger(count) || count < 1 || count > 366) throw AppError.badRequest('Informe uma estadia de 1 a 366 noites, com saída após a entrada.');
  return Array.from({ length: count }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

router.get('/units', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const query = z.object(paging).strict().parse(req.query);
  if (query.page !== undefined || query.limit !== undefined) {
    const page = query.page ?? 1; const limit = query.limit ?? 20;
    const where = { organizationId: req.organizationContext!.organization.id };
    const [units, total] = await prisma.$transaction([
      prisma.lodgingUnit.findMany({ where, select: unitSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
      prisma.lodgingUnit.count({ where }),
    ]);
    res.json({ units, pagination: paginated(page, limit, total) }); return;
  }
  const units = await prisma.lodgingUnit.findMany({ where: { organizationId: req.organizationContext!.organization.id }, select: unitSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  res.json({ units });
}));
router.post('/units', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const input = unitInput.parse(req.body);
  const unit = await prisma.lodgingUnit.create({ data: { organizationId: req.organizationContext!.organization.id, name: input.name }, select: unitSelect });
  res.status(201).json(unit);
}));
router.get('/reservations', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const query = z.object({ ...paging, status: status.optional(), search: z.string().trim().max(150).optional() }).strict().parse(req.query);
  if (query.page !== undefined || query.limit !== undefined || query.status || query.search) {
    const page = query.page ?? 1; const limit = query.limit ?? 20;
    const organizationId = req.organizationContext!.organization.id;
    const where = { organizationId, ...(query.status ? { status: query.status } : {}) };
    const orderBy = [{ checkIn: 'asc' as const }, { id: 'asc' as const }];
    const [reservations, total] = query.search ? await prisma.$transaction(async tx => {
      const clauses = [Prisma.sql`"organizationId" = ${organizationId}`, Prisma.sql`instr(${fold(Prisma.sql`"guestName"`)}, ${fold(Prisma.sql`${query.search}`)}) > 0`];
      if (query.status) clauses.push(Prisma.sql`"status" = ${query.status}`);
      const condition = Prisma.join(clauses, ' AND ');
      const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT "id" FROM "LodgingReservation" WHERE ${condition} ORDER BY "checkIn" ASC, "id" ASC LIMIT ${limit} OFFSET ${(page - 1) * limit}`);
      const count = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total FROM "LodgingReservation" WHERE ${condition}`);
      const rows = await tx.lodgingReservation.findMany({ where: { ...where, id: { in: ids.map(item => item.id) } }, include: reservationInclude, orderBy });
      return [rows, Number(count[0].total)] as const;
    }) : await prisma.$transaction([
      prisma.lodgingReservation.findMany({ where, include: reservationInclude, orderBy, skip: (page - 1) * limit, take: limit }),
      prisma.lodgingReservation.count({ where }),
    ]);
    res.json({ reservations, pagination: paginated(page, limit, total) }); return;
  }
  const reservations = await prisma.lodgingReservation.findMany({
    where: { organizationId: req.organizationContext!.organization.id }, include: reservationInclude,
    orderBy: [{ checkIn: 'asc' }, { id: 'asc' }],
  });
  res.json({ reservations });
}));

// A snapshot of occupied nights for the displayed unit page, independently of
// the paginated reservation list. Checkout is exclusive.
router.get('/occupancy', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const query = z.object({ start: z.iso.date(), end: z.iso.date(), ...paging }).strict().parse(req.query);
  const count = (Date.parse(`${query.end}T00:00:00.000Z`) - Date.parse(`${query.start}T00:00:00.000Z`)) / 86_400_000;
  if (!Number.isInteger(count) || count < 1 || count > 31) throw AppError.badRequest('Informe um intervalo de 1 a 31 noites.');
  const page = query.page ?? 1; const limit = query.limit ?? 20;
  const where = { organizationId: req.organizationContext!.organization.id };
  const result = await prisma.$transaction(async tx => {
    const [units, total] = await Promise.all([
      tx.lodgingUnit.findMany({ where, select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
      tx.lodgingUnit.count({ where }),
    ]);
    const nights = await tx.lodgingNight.findMany({ where: { unitId: { in: units.map(unit => unit.id) }, night: { gte: query.start, lt: query.end } }, select: { unitId: true, night: true, blockId: true }, orderBy: { night: 'asc' } });
    return { units: units.map(unit => ({ ...unit, occupiedNights: nights.filter(night => night.unitId === unit.id).map(night => night.night), blockedNights: nights.filter(night => night.unitId === unit.id && night.blockId !== null).map(night => night.night) })), pagination: paginated(page, limit, total), start: query.start, end: query.end };
  });
  res.json(result);
}));

router.get('/movement', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const { date } = z.object({ date: z.iso.date() }).strict().parse(req.query);
  const organizationId = req.organizationContext!.organization.id;
  const [arrivals, departures, overdueArrivals, overdueDepartures] = await prisma.$transaction([
    prisma.lodgingReservation.count({ where: { organizationId, status: 'CONFIRMED', checkIn: date } }),
    prisma.lodgingReservation.count({ where: { organizationId, status: 'CHECKED_IN', checkOut: date } }),
    prisma.lodgingReservation.count({ where: { organizationId, status: 'CONFIRMED', checkIn: { lt: date } } }),
    prisma.lodgingReservation.count({ where: { organizationId, status: 'CHECKED_IN', checkOut: { lt: date } } }),
  ]);
  res.json({ arrivals, departures, overdueArrivals, overdueDepartures });
}));
router.post('/reservations', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const input = reservationInput.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;
  const nights = occupiedNights(input.checkIn, input.checkOut);
  const unit = await prisma.lodgingUnit.findFirst({ where: { id: input.unitId, organizationId }, select: { id: true } });
  if (!unit) throw AppError.notFound('Acomodação não encontrada.');
  try {
    // A criação aninhada é atômica. A chave única (unidade, noite) impede
    // conflitos até quando requisições concorrentes chegam a processos distintos.
    const reservation = await prisma.lodgingReservation.create({
      data: { ...input, organizationId, nights: { create: nights.map(night => ({ night })) } },
      include: reservationInclude,
    });
    res.status(201).json(reservation);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw AppError.conflict('A acomodação já está reservada ou bloqueada em pelo menos uma dessas noites.');
    throw error;
  }
}));

router.get('/blocks', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const query = z.object(paging).strict().parse(req.query);
  const page = query.page ?? 1; const limit = query.limit ?? 20;
  const where = { organizationId: req.organizationContext!.organization.id };
  const [blocks, total] = await prisma.$transaction([
    prisma.lodgingBlock.findMany({ where, include: { unit: { select: { id: true, name: true } } }, orderBy: [{ start: 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
    prisma.lodgingBlock.count({ where }),
  ]);
  res.json({ blocks, pagination: paginated(page, limit, total) });
}));

router.post('/blocks', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const input = blockInput.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;
  const nights = occupiedNights(input.start, input.end);
  const unit = await prisma.lodgingUnit.findFirst({ where: { id: input.unitId, organizationId }, select: { id: true } });
  if (!unit) throw AppError.notFound('Acomodação não encontrada.');
  try {
    const block = await prisma.lodgingBlock.create({
      data: { ...input, reason: input.reason || null, organizationId, nights: { create: nights.map(night => ({ night })) } },
      include: { unit: { select: { id: true, name: true } } },
    });
    res.status(201).json(block);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw AppError.conflict('A acomodação já está reservada ou bloqueada em pelo menos uma dessas noites.');
    throw error;
  }
}));

router.post('/blocks/:id/cancel', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const id = identifier.parse(req.params.id);
  const organizationId = req.organizationContext!.organization.id;
  const block = await prisma.$transaction(async tx => {
    const updated = await tx.lodgingBlock.updateMany({ where: { id, organizationId, status: 'ACTIVE' }, data: { status: 'CANCELLED' } });
    const existing = await tx.lodgingBlock.findFirst({ where: { id, organizationId }, include: { unit: { select: { id: true, name: true } } } });
    if (!existing) throw AppError.notFound('Bloqueio não encontrado.');
    if (updated.count) await tx.lodgingNight.deleteMany({ where: { blockId: id } });
    else if (existing.status !== 'CANCELLED') throw AppError.conflict('Não é possível cancelar este bloqueio.');
    return existing;
  });
  res.json(block);
}));
router.post('/reservations/:id/cancel', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const id = identifier.parse(req.params.id);
  const organizationId = req.organizationContext!.organization.id;
  const reservation = await prisma.$transaction(async tx => {
    // O predicado de estado está na escrita: um check-in concorrente não pode
    // ser cancelado por uma leitura anterior que ainda o via como confirmado.
    const updated = await tx.lodgingReservation.updateMany({ where: { id, organizationId, status: 'CONFIRMED' }, data: { status: 'CANCELLED' } });
    const existing = await tx.lodgingReservation.findFirst({ where: { id, organizationId }, include: reservationInclude });
    if (!existing) throw AppError.notFound('Reserva não encontrada.');
    if (updated.count) {
      await tx.lodgingNight.deleteMany({ where: { reservationId: id } });
      return existing;
    }
    if (existing.status === 'CANCELLED') return existing;
    throw AppError.conflict('Somente reservas confirmadas podem ser canceladas.');
  });
  res.json(reservation);
}));

function operation(from: 'CONFIRMED' | 'CHECKED_IN', to: 'CHECKED_IN' | 'CHECKED_OUT') {
  return asyncHandler(async (req: OrganizationRequest, res: Response) => {
    const id = identifier.parse(req.params.id);
    const organizationId = req.organizationContext!.organization.id;
    const reservation = await prisma.$transaction(async tx => {
      const updated = await tx.lodgingReservation.updateMany({ where: { id, organizationId, status: from }, data: { status: to } });
      const current = await tx.lodgingReservation.findFirst({ where: { id, organizationId }, include: reservationInclude });
      if (!current) throw AppError.notFound('Reserva não encontrada.');
      if (!updated.count && current.status !== to) throw AppError.conflict('Operação incompatível com o estado atual da reserva.');
      return current;
    });
    res.json(reservation);
  });
}

// Estas marcações registram a operação; não alteram datas nem liberam noites.
router.post('/reservations/:id/check-in', operation('CONFIRMED', 'CHECKED_IN'));
router.post('/reservations/:id/check-out', operation('CHECKED_IN', 'CHECKED_OUT'));
export default router;
