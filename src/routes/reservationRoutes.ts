import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authenticate, authorize, type AuthRequest } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import {
  currentLegacyLeadFilterWithConsistentTrip,
  currentLegacyTourismFilter,
  currentReservationCountInLegacyScope,
  currentReservationExistsInLegacyScope,
  currentReservationIdsInLegacyScopePage,
  legacyTourismOrganizationIdForNewRecord,
} from '../services/legacyTourismScope.js';
import { recordReservationAuditIfOwned } from '../services/reservationAudit.js';

// A operação legada só grava auditoria quando a reserva pertence a uma
// empresa real (LEGACY_TOURISM_ORGANIZATION_ID configurado — modo
// compartilhado: ver legacyTourismScope.ts). Reserva legada sem empresa
// (organizationId null, o caso comum fora do modo compartilhado) continua
// sem trilha, como sempre — não há empresa a quem pertença esse histórico,
// e mudar isso agora criaria entradas "órfãs" sem organização dona.
// recordReservationAuditIfOwned já faz esse corte sozinha (organizationId
// null é no-op); aqui só nomeamos o ator (quem está logado no painel
// legado).

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
// As duas interfaces usam a versão da reserva para detectar mudanças em
// parcelas. Toda escrita legada precisa avançá-la na mesma transação.
async function bumpReservationVersion(tx: Prisma.TransactionClient, id: string, previous: Date) {
  const updatedAt = new Date(Math.max(Date.now(), previous.getTime() + 1));
  const result = await tx.reservation.updateMany({ where: { id, updatedAt: previous }, data: { updatedAt } });
  if (result.count !== 1) throw AppError.conflict('Esta reserva foi alterada por outra pessoa. Recarregue os dados antes de salvar.');
}
async function checkLead(tx: Prisma.TransactionClient, leadId: string | null | undefined, tripId: string) {
  if (!leadId) return;
  // Mesma consulta: um interessado de outra empresa é tratado como inexistente,
  // nunca vinculável a uma reserva legada.
  const lead = await tx.lead.findFirst({ where: { id: leadId, ...currentLegacyLeadFilterWithConsistentTrip() }, select: { id: true, tripId: true } });
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
  // A filtragem de segurança (escopo + consistência transitiva reserva/lead/
  // viagem) roda inteiramente no SQLite via EXISTS/JOIN, incluindo ORDER/LIMIT,
  // antes de qualquer busca de dados — nunca materializa IDs de outras
  // empresas: a lista de IDs retornada já é só a página pedida (no máximo
  // `limit`, ≤ 100), nunca a tabela inteira.
  const scopeFilters = { tripId: query.tripId, status: query.status };
  const { pageIds, total, rows } = await prisma.$transaction(async tx => {
    const [pageIds, total] = await Promise.all([
      currentReservationIdsInLegacyScopePage(tx, scopeFilters, { skip: (page - 1) * limit, take: limit }),
      currentReservationCountInLegacyScope(tx, scopeFilters),
    ]);
    // Leia os dados no mesmo snapshot em que o escopo foi validado; não
    // reutilize IDs autorizados numa consulta posterior fora da transação.
    const rows = pageIds.length
      ? await tx.reservation.findMany({
        where: { id: { in: pageIds } },
        include: { trip: { select: { id: true, title: true, startDateISO: true } }, lead: { select: { id: true, name: true } }, installments: { orderBy: { createdAt: 'asc' } } },
      })
      : [];
    return { pageIds, total, rows };
  });
  const byId = new Map(rows.map(row => [row.id, row]));
  const data = pageIds.map(id => byId.get(id)).filter((row): row is typeof rows[number] => row !== undefined);
  res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const row = await prisma.$transaction(async tx => {
    // Busca só o ID necessário (nunca a tabela inteira): uma reserva de outra
    // empresa, ou cuja viagem/lead seja inconsistente com o escopo, não deve
    // nem ser encontrada.
    const allowed = await currentReservationExistsInLegacyScope(tx, { id });
    if (!allowed) return null;
    return tx.reservation.findFirst({ where: { id }, include: { trip: { select: { id: true, title: true, startDateISO: true } }, lead: { select: { id: true, name: true } }, installments: { orderBy: { createdAt: 'asc' } } } });
  });
  if (!row) throw AppError.notFound('Reserva não encontrada.');
  res.json(row);
}));

router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = createSchema.parse(req.body);
  const row = await prisma.$transaction(async tx => {
    // Mesma consulta: nunca cria reserva vinculada a uma viagem de outra
    // empresa (a FK do banco garante apenas que a viagem existe).
    const trip = await tx.trip.findFirst({ where: { id: data.tripId, ...currentLegacyTourismFilter() }, select: { id: true } });
    if (!trip) throw AppError.notFound('Viagem não encontrada.');
    await checkLead(tx, data.leadId, data.tripId);
    const created = await tx.reservation.create({ data: { ...data, organizationId: legacyTourismOrganizationIdForNewRecord() }, include: { installments: true } });
    await recordReservationAuditIfOwned(tx, { organizationId: created.organizationId, actorUserId: req.user!.id, action: 'RESERVATION_CREATED', entityType: 'Reservation', entityId: created.id, reservationId: created.id });
    return created;
  });
  res.status(201).json(row);
}));

router.patch('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const data = updateSchema.parse(req.body);
  const row = await prisma.$transaction(async tx => {
    // Existência e escopo da reserva checados na mesma transação da atualização.
    const allowed = await currentReservationExistsInLegacyScope(tx, { id });
    const reservation = allowed ? await tx.reservation.findFirst({ where: { id }, include: { installments: true } }) : null;
    if (!reservation) throw AppError.notFound('Reserva não encontrada.');
    await checkLead(tx, data.leadId, reservation.tripId);
    const allocated = reservation.installments.reduce((sum, entry) => sum + entry.amountCents, 0);
    if (data.totalCents !== undefined && data.totalCents < allocated) throw AppError.conflict('O valor total não pode ser menor que a soma das parcelas.');
    const updatedAt = new Date(Math.max(Date.now(), reservation.updatedAt.getTime() + 1));
    const updated = await tx.reservation.update({ where: { id }, data: { ...data, updatedAt }, include: { installments: { orderBy: { createdAt: 'asc' } } } });
    await recordReservationAuditIfOwned(tx, { organizationId: reservation.organizationId, actorUserId: req.user!.id, action: 'RESERVATION_UPDATED', entityType: 'Reservation', entityId: id, reservationId: id });
    return updated;
  });
  res.json(row);
}));

router.post('/:id/installments', asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const data = installmentCreateSchema.parse(req.body);
  const row = await prisma.$transaction(async tx => {
    const allowed = await currentReservationExistsInLegacyScope(tx, { id });
    const reservation = allowed ? await tx.reservation.findFirst({ where: { id }, include: { installments: true } }) : null;
    if (!reservation) throw AppError.notFound('Reserva não encontrada.');
    if (reservation.status === 'CANCELLED') throw AppError.conflict('Não é possível adicionar parcelas a uma reserva cancelada.');
    if (reservation.installments.length >= 120) throw AppError.conflict('A reserva já atingiu o limite de 120 parcelas.');
    const allocated = reservation.installments.reduce((sum, entry) => sum + entry.amountCents, 0);
    if (allocated + data.amountCents > reservation.totalCents) throw AppError.conflict('A soma das parcelas não pode ultrapassar o total da reserva.');
    const installment = await tx.reservationInstallment.create({ data: { reservationId: id, amountCents: data.amountCents, dueDate: dateFromDay(data.dueDate) } });
    await bumpReservationVersion(tx, id, reservation.updatedAt);
    await recordReservationAuditIfOwned(tx, { organizationId: reservation.organizationId, actorUserId: req.user!.id, action: 'INSTALLMENT_CREATED', entityType: 'ReservationInstallment', entityId: installment.id, reservationId: id });
    return installment;
  });
  res.status(201).json(row);
}));

router.patch('/:id/installments/:installmentId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const installmentId = idSchema.parse(req.params.installmentId);
  const data = installmentUpdateSchema.parse(req.body);
  const row = await prisma.$transaction(async tx => {
    const allowed = await currentReservationExistsInLegacyScope(tx, { id });
    const reservation = allowed ? await tx.reservation.findFirst({ where: { id }, include: { installments: true } }) : null;
    if (!reservation) throw AppError.notFound('Reserva não encontrada.');
    if (reservation.status === 'CANCELLED') throw AppError.conflict('Não é possível alterar parcelas de uma reserva cancelada.');
    const existing = reservation.installments.find(entry => entry.id === installmentId);
    if (!existing) throw AppError.notFound('Parcela não encontrada.');
    if (existing.paidAt && (data.amountCents !== undefined || data.dueDate !== undefined)) {
      throw AppError.conflict('Desmarque o pagamento antes de alterar valor ou vencimento.');
    }
    const allocated = reservation.installments.reduce((sum, entry) => sum + (entry.id === installmentId ? data.amountCents ?? entry.amountCents : entry.amountCents), 0);
    if (allocated > reservation.totalCents) throw AppError.conflict('A soma das parcelas não pode ultrapassar o total da reserva.');
    const installment = await tx.reservationInstallment.update({ where: { id: installmentId }, data: {
      amountCents: data.amountCents,
      dueDate: data.dueDate === undefined ? undefined : dateFromDay(data.dueDate),
      paidAt: data.paid === undefined ? undefined : data.paid ? existing.paidAt ?? new Date() : null,
    } });
    await bumpReservationVersion(tx, id, reservation.updatedAt);
    await recordReservationAuditIfOwned(tx, { organizationId: reservation.organizationId, actorUserId: req.user!.id, action: 'INSTALLMENT_UPDATED', entityType: 'ReservationInstallment', entityId: installmentId, reservationId: id });
    return installment;
  });
  res.json(row);
}));

router.delete('/:id/installments/:installmentId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = idSchema.parse(req.params.id);
  const installmentId = idSchema.parse(req.params.installmentId);
  await prisma.$transaction(async tx => {
    const allowed = await currentReservationExistsInLegacyScope(tx, { id });
    const reservation = allowed ? await tx.reservation.findFirst({ where: { id }, include: { installments: true } }) : null;
    if (!reservation) throw AppError.notFound('Reserva não encontrada.');
    if (reservation.status === 'CANCELLED') throw AppError.conflict('Não é possível alterar parcelas de uma reserva cancelada.');
    const installment = reservation.installments.find(entry => entry.id === installmentId);
    if (!installment) throw AppError.notFound('Parcela não encontrada.');
    if (installment.paidAt) throw AppError.conflict('Desmarque o pagamento antes de excluir a parcela.');
    await tx.reservationInstallment.delete({ where: { id: installmentId } });
    await bumpReservationVersion(tx, id, reservation.updatedAt);
    await recordReservationAuditIfOwned(tx, { organizationId: reservation.organizationId, actorUserId: req.user!.id, action: 'INSTALLMENT_DELETED', entityType: 'ReservationInstallment', entityId: installmentId, reservationId: id });
  });
  res.status(204).end();
}));

export default router;
