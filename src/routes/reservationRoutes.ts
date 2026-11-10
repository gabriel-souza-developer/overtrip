import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

// Todos os valores são centavos inteiros. Este módulo registra apenas a operação
// administrativa: não processa pagamentos nem altera automaticamente as vagas.
const money = z.number().int().min(0).max(100_000_000);
const day = z.iso.date();
const nullableDay = day.nullable();
const reservationFields = {
  customerName: z.string().trim().min(1).max(160),
  customerPhone: z.string().trim().max(40).nullable().optional(),
  seats: z.number().int().min(1).max(100),
  totalCents: money,
  notes: z.string().trim().max(2000).nullable().optional(),
  leadId: z.string().min(1).max(128).nullable().optional(),
};
const createSchema = z.object({ tripId: z.string().min(1).max(128), ...reservationFields }).strict();
const updateSchema = z.object({
  ...reservationFields,
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']),
}).partial().strict().refine(data => Object.keys(data).length > 0, 'Informe ao menos um campo.');
const installmentCreateSchema = z.object({ amountCents: money.min(1), dueDate: nullableDay.optional() }).strict();
const installmentUpdateSchema = z.object({
  amountCents: money.min(1).optional(),
  dueDate: nullableDay.optional(),
  paid: z.boolean().optional(),
}).strict().refine(data => Object.keys(data).length > 0, 'Informe ao menos um campo.');
const dateFromDay = (value: string | null | undefined) => value ? new Date(`${value}T12:00:00.000Z`) : null;
const idSchema = z.string().min(1).max(128);
async function checkLead(tx: Prisma.TransactionClient, leadId: string | null | undefined, tripId: string) {
  if (!leadId) return;
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { id: true, tripId: true } });
  if (!lead) throw AppError.notFound('Interessado não encontrado.');
  if (lead.tripId && lead.tripId !== tripId) throw AppError.conflict('O interessado está associado a outra viagem.');
}

const router = Router();
// As respostas contêm informações de clientes e lançamentos financeiros.
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(authenticate, authorize('admin'));

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const positive = z.string().regex(/^[1-9]\d{0,5}$/).transform(Number);
  const query = z.object({ tripId: idSchema.optional(), status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']).optional(), page: positive.optional(), limit: positive.optional() }).strict().parse(req.query);
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  if (limit > 100) throw AppError.badRequest('O limite máximo é de 100 reservas por página.');
  const where = { tripId: query.tripId, status: query.status };
  const [rows, total] = await prisma.$transaction([
    prisma.reservation.findMany({
      where,
      include: { trip: { select: { id: true, title: true, startDateISO: true } }, installments: { orderBy: { createdAt: 'asc' } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit,
    }),
    prisma.reservation.count({ where }),
  ]);
  res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const row = await prisma.reservation.findUnique({ where: { id }, include: { trip: { select: { id: true, title: true, startDateISO: true } }, installments: { orderBy: { createdAt: 'asc' } } } });
  if (!row) throw AppError.notFound('Reserva não encontrada.');
  res.json(row);
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const data = createSchema.parse(req.body);
  const row = await prisma.$transaction(async tx => {
    const trip = await tx.trip.findUnique({ where: { id: data.tripId }, select: { id: true } });
    if (!trip) throw AppError.notFound('Viagem não encontrada.');
    await checkLead(tx, data.leadId, data.tripId);
    return tx.reservation.create({ data, include: { installments: true } });
  });
  res.status(201).json(row);
}));

router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const data = updateSchema.parse(req.body);
  const row = await prisma.$transaction(async tx => {
    const reservation = await tx.reservation.findUnique({ where: { id }, include: { installments: true } });
    if (!reservation) throw AppError.notFound('Reserva não encontrada.');
    await checkLead(tx, data.leadId, reservation.tripId);
    const allocated = reservation.installments.reduce((sum, entry) => sum + entry.amountCents, 0);
    if (data.totalCents !== undefined && data.totalCents < allocated) throw AppError.conflict('O valor total não pode ser menor que a soma das parcelas.');
    return tx.reservation.update({ where: { id }, data, include: { installments: { orderBy: { createdAt: 'asc' } } } });
  });
  res.json(row);
}));

router.post('/:id/installments', asyncHandler(async (req: Request, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const data = installmentCreateSchema.parse(req.body);
  const row = await prisma.$transaction(async tx => {
    const reservation = await tx.reservation.findUnique({ where: { id }, include: { installments: true } });
    if (!reservation) throw AppError.notFound('Reserva não encontrada.');
    if (reservation.status === 'CANCELLED') throw AppError.conflict('Não é possível adicionar parcelas a uma reserva cancelada.');
    if (reservation.installments.length >= 120) throw AppError.conflict('A reserva já atingiu o limite de 120 parcelas.');
    const allocated = reservation.installments.reduce((sum, entry) => sum + entry.amountCents, 0);
    if (allocated + data.amountCents > reservation.totalCents) throw AppError.conflict('A soma das parcelas não pode ultrapassar o total da reserva.');
    return tx.reservationInstallment.create({ data: { reservationId: id, amountCents: data.amountCents, dueDate: dateFromDay(data.dueDate) } });
  });
  res.status(201).json(row);
}));

router.patch('/:id/installments/:installmentId', asyncHandler(async (req: Request, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const installmentId = idSchema.parse(req.params.installmentId);
  const data = installmentUpdateSchema.parse(req.body);
  const row = await prisma.$transaction(async tx => {
    const reservation = await tx.reservation.findUnique({ where: { id }, include: { installments: true } });
    if (!reservation) throw AppError.notFound('Reserva não encontrada.');
    if (reservation.status === 'CANCELLED') throw AppError.conflict('Não é possível alterar parcelas de uma reserva cancelada.');
    const existing = reservation.installments.find(entry => entry.id === installmentId);
    if (!existing) throw AppError.notFound('Parcela não encontrada.');
    if (existing.paidAt && (data.amountCents !== undefined || data.dueDate !== undefined)) {
      throw AppError.conflict('Desmarque o pagamento antes de alterar valor ou vencimento.');
    }
    const allocated = reservation.installments.reduce((sum, entry) => sum + (entry.id === installmentId ? data.amountCents ?? entry.amountCents : entry.amountCents), 0);
    if (allocated > reservation.totalCents) throw AppError.conflict('A soma das parcelas não pode ultrapassar o total da reserva.');
    return tx.reservationInstallment.update({ where: { id: installmentId }, data: {
      amountCents: data.amountCents,
      dueDate: data.dueDate === undefined ? undefined : dateFromDay(data.dueDate),
      paidAt: data.paid === undefined ? undefined : data.paid ? existing.paidAt ?? new Date() : null,
    } });
  });
  res.json(row);
}));

router.delete('/:id/installments/:installmentId', asyncHandler(async (req: Request, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const installmentId = idSchema.parse(req.params.installmentId);
  await prisma.$transaction(async tx => {
    const reservation = await tx.reservation.findUnique({ where: { id }, include: { installments: true } });
    if (!reservation) throw AppError.notFound('Reserva não encontrada.');
    if (reservation.status === 'CANCELLED') throw AppError.conflict('Não é possível alterar parcelas de uma reserva cancelada.');
    const installment = reservation.installments.find(entry => entry.id === installmentId);
    if (!installment) throw AppError.notFound('Parcela não encontrada.');
    if (installment.paidAt) throw AppError.conflict('Desmarque o pagamento antes de excluir a parcela.');
    await tx.reservationInstallment.delete({ where: { id: installmentId } });
  });
  res.status(204).end();
}));

export default router;
