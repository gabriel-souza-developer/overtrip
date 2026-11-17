import { Router, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { authorizeOrganization, requireOrganization, type OrganizationRequest } from '../middleware/organizationContext.js';
import { organizationMembershipReader } from '../services/organizationMembership.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.use(authenticate, requireOrganization(organizationMembershipReader), authorizeOrganization('owner', 'admin', 'staff'));
router.use((req: OrganizationRequest, _res, next) => {
  if (req.organization?.niche !== 'restaurante') { next(AppError.forbidden('Este módulo é exclusivo de restaurantes.')); return; }
  next();
});

const identifier = z.string().trim().min(1).max(128);
const shift = z.enum(['ALMOCO', 'JANTAR']);
const tableInput = z.object({ name: z.string().trim().min(1).max(120), capacity: z.number().int().min(1).max(50) }).strict();
const reservationInput = z.object({
  tableId: identifier,
  guestName: z.string().trim().min(1).max(150),
  partySize: z.number().int().min(1).max(50),
  date: z.iso.date(),
  shift,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).strict();
const tableSelect = { id: true, name: true, capacity: true, createdAt: true } as const;
const reservationInclude = { table: { select: { id: true, name: true, capacity: true } } } as const;
const pageValue = z.string().regex(/^[1-9]\d{0,4}$/).transform(Number);
const limitValue = z.string().regex(/^[1-9]\d?$/).transform(Number).refine(value => value <= 50);
const paging = { page: pageValue.optional(), limit: limitValue.optional() };
const statusValue = z.enum(['CONFIRMED', 'ARRIVED', 'NO_SHOW', 'CANCELLED']);
const paginated = (page: number, limit: number, total: number) => ({ page, limit, total, totalPages: Math.ceil(total / limit) });
// SQLite lower() folds ASCII only. Fold common Portuguese uppercase accents too;
// accents remain meaningful and decomposed Unicode is not normalized.
const fold = (value: Prisma.Sql) => {
  const pairs = [['Á','á'],['À','à'],['Â','â'],['Ã','ã'],['Ä','ä'],['É','é'],['È','è'],['Ê','ê'],['Ë','ë'],['Í','í'],['Ì','ì'],['Î','î'],['Ï','ï'],['Ó','ó'],['Ò','ò'],['Ô','ô'],['Õ','õ'],['Ö','ö'],['Ú','ú'],['Ù','ù'],['Û','û'],['Ü','ü'],['Ç','ç']] as const;
  return Prisma.sql`lower(${pairs.reduce((expr, [upper, lower]) => Prisma.sql`replace(${expr}, ${upper}, ${lower})`, value)})`;
};

router.get('/tables', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const query = z.object(paging).strict().parse(req.query);
  if (query.page !== undefined || query.limit !== undefined) {
    const page = query.page ?? 1; const limit = query.limit ?? 20;
    const where = { organizationId: req.organization!.id };
    const [tables, total] = await prisma.$transaction([
      prisma.restaurantTable.findMany({ where, select: tableSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
      prisma.restaurantTable.count({ where }),
    ]);
    res.json({ tables, pagination: paginated(page, limit, total) }); return;
  }
  const tables = await prisma.restaurantTable.findMany({ where: { organizationId: req.organization!.id }, select: tableSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  res.json({ tables });
}));
router.post('/tables', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const input = tableInput.parse(req.body);
  const table = await prisma.restaurantTable.create({ data: { organizationId: req.organization!.id, name: input.name, capacity: input.capacity }, select: tableSelect });
  res.status(201).json(table);
}));

router.get('/reservations', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const query = z.object({ ...paging, status: statusValue.optional(), search: z.string().trim().max(150).optional() }).strict().parse(req.query);
  if (query.page !== undefined || query.limit !== undefined || query.status || query.search) {
    const page = query.page ?? 1; const limit = query.limit ?? 20;
    const organizationId = req.organization!.id;
    const where = { organizationId, ...(query.status ? { status: query.status } : {}) };
    const orderBy = [{ date: 'asc' as const }, { time: 'asc' as const }, { id: 'asc' as const }];
    const [reservations, total] = query.search ? await prisma.$transaction(async tx => {
      const clauses = [Prisma.sql`"organizationId" = ${organizationId}`, Prisma.sql`instr(${fold(Prisma.sql`"guestName"`)}, ${fold(Prisma.sql`${query.search}`)}) > 0`];
      if (query.status) clauses.push(Prisma.sql`"status" = ${query.status}`);
      const condition = Prisma.join(clauses, ' AND ');
      const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT "id" FROM "RestaurantReservation" WHERE ${condition} ORDER BY "date" ASC, "time" ASC, "id" ASC LIMIT ${limit} OFFSET ${(page - 1) * limit}`);
      const count = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total FROM "RestaurantReservation" WHERE ${condition}`);
      const rows = await tx.restaurantReservation.findMany({ where: { ...where, id: { in: ids.map(item => item.id) } }, include: reservationInclude, orderBy });
      return [rows, Number(count[0].total)] as const;
    }) : await prisma.$transaction([
      prisma.restaurantReservation.findMany({ where, include: reservationInclude, orderBy, skip: (page - 1) * limit, take: limit }),
      prisma.restaurantReservation.count({ where }),
    ]);
    res.json({ reservations, pagination: paginated(page, limit, total) }); return;
  }
  const reservations = await prisma.restaurantReservation.findMany({
    where: { organizationId: req.organization!.id }, include: reservationInclude,
    orderBy: [{ date: 'asc' }, { time: 'asc' }, { id: 'asc' }],
  });
  res.json({ reservations });
}));

router.get('/movement', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const { date } = z.object({ date: z.iso.date() }).strict().parse(req.query);
  const organizationId = req.organization!.id;
  const [expected, arrived, overdue] = await prisma.$transaction([
    prisma.restaurantReservation.count({ where: { organizationId, status: 'CONFIRMED', date } }),
    prisma.restaurantReservation.count({ where: { organizationId, status: 'ARRIVED', date } }),
    prisma.restaurantReservation.count({ where: { organizationId, status: 'CONFIRMED', date: { lt: date } } }),
  ]);
  res.json({ expected, arrived, overdue });
}));

router.post('/reservations', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const input = reservationInput.parse(req.body);
  const organizationId = req.organization!.id;
  const table = await prisma.restaurantTable.findFirst({ where: { id: input.tableId, organizationId }, select: { id: true, capacity: true } });
  if (!table) throw AppError.notFound('Mesa não encontrada.');
  if (input.partySize > table.capacity) throw AppError.badRequest('O grupo é maior do que a capacidade da mesa.');
  try {
    // A criação aninhada é atômica. A chave única (mesa, data, turno) impede
    // conflitos até quando requisições concorrentes chegam a processos distintos.
    const reservation = await prisma.restaurantReservation.create({
      data: { ...input, organizationId, occupancy: { create: [{ date: input.date, shift: input.shift }] } },
      include: reservationInclude,
    });
    res.status(201).json(reservation);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw AppError.conflict('A mesa já está reservada nesse turno.');
    throw error;
  }
}));

router.post('/reservations/:id/cancel', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const id = identifier.parse(req.params.id);
  const organizationId = req.organization!.id;
  const reservation = await prisma.$transaction(async tx => {
    // O predicado de estado está na escrita: uma chegada concorrente não pode
    // ser cancelada por uma leitura anterior que ainda a via como confirmada.
    const updated = await tx.restaurantReservation.updateMany({ where: { id, organizationId, status: 'CONFIRMED' }, data: { status: 'CANCELLED' } });
    const existing = await tx.restaurantReservation.findFirst({ where: { id, organizationId }, include: reservationInclude });
    if (!existing) throw AppError.notFound('Reserva não encontrada.');
    if (updated.count) {
      await tx.restaurantOccupancy.deleteMany({ where: { reservationId: id } });
      return existing;
    }
    if (existing.status === 'CANCELLED') return existing;
    throw AppError.conflict('Somente reservas confirmadas podem ser canceladas.');
  });
  res.json(reservation);
}));

function operation(to: 'ARRIVED' | 'NO_SHOW') {
  return asyncHandler(async (req: OrganizationRequest, res: Response) => {
    const id = identifier.parse(req.params.id);
    const organizationId = req.organization!.id;
    const reservation = await prisma.$transaction(async tx => {
      const updated = await tx.restaurantReservation.updateMany({ where: { id, organizationId, status: 'CONFIRMED' }, data: { status: to } });
      const current = await tx.restaurantReservation.findFirst({ where: { id, organizationId }, include: reservationInclude });
      if (!current) throw AppError.notFound('Reserva não encontrada.');
      if (!updated.count && current.status !== to) throw AppError.conflict('Operação incompatível com o estado atual da reserva.');
      return current;
    });
    res.json(reservation);
  });
}

// Estas marcações registram a operação; não alteram a mesa nem liberam o turno.
router.post('/reservations/:id/arrive', operation('ARRIVED'));
router.post('/reservations/:id/no-show', operation('NO_SHOW'));
export default router;
