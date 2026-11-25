import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { assertOrganizationWriteAccess, requireOrganizationMembership, type OrganizationRequest } from '../middleware/organizationContext.js';
import { recordReservationAuditIfOwned } from '../services/reservationAudit.js';

// Parent router provides authentication and no-store; account-global roles
// never grant access to another company's private customer/payment records.
const router = Router({ mergeParams: true });
router.use(requireOrganizationMembership('OWNER', 'ADMIN'));
const select = {
  id: true, tripId: true, customerName: true, customerPhone: true, seats: true,
  status: true, totalCents: true, notes: true, createdAt: true, updatedAt: true,
  trip: { select: { id: true, title: true, startDateISO: true } },
  lead: { select: { id: true, organizationId: true, tripId: true } },
  installments: { select: { id: true, amountCents: true, dueDate: true, paidAt: true, createdAt: true, updatedAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ReservationSelect;
type ReservationProjection = {
  tripId: string;
  lead: { id: string; organizationId: string | null; tripId: string | null } | null;
};
function safeReservation<T extends ReservationProjection>({ lead, ...reservation }: T, organizationId: string) {
  const safe = lead?.organizationId === organizationId && (!lead.tripId || lead.tripId === reservation.tripId);
  return { ...reservation, leadId: safe ? lead.id : null };
}
const filters = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

// Grava a mesma trilha mínima de auditoria (recordReservationAuditIfOwned,
// compartilhada com a operação legada em reservationRoutes.ts — ver
// src/services/reservationAudit.ts). organizationId aqui é sempre o da
// própria empresa (nunca nulo, por já vir de req.organizationContext), logo
// toda mutação desta rota grava uma entrada.
const auditSelect = { id: true, action: true, entityType: true, entityId: true, actorUserId: true, createdAt: true } satisfies Prisma.ReservationAuditLogSelect;

// Registro manual: nunca processa pagamento nem reduz vagas por conta
// própria (deixado explícito também na interface). Só os campos essenciais
// — viagem, cliente, telefone, lugares e valor em centavos — mais o vínculo
// opcional com um interessado, aceito apenas quando totalmente consistente.
// A regra de não baixar o total abaixo das parcelas já existentes vale tanto
// aqui quanto nas rotas de parcela abaixo.
const STATUS = z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']);
const money = z.number().int().min(0).max(100_000_000);
const nullableDay = z.iso.date().nullable();
const dateFromDay = (value: string | null | undefined) => value ? new Date(`${value}T12:00:00.000Z`) : null;
const essentialReservationFields = {
  customerName: z.string().trim().min(1, 'Nome do cliente é obrigatório').max(160, 'Nome longo demais'),
  customerPhone: z.string().trim().max(40, 'Telefone longo demais').nullable().optional(),
  seats: z.number().int().min(1, 'Informe ao menos um lugar').max(100, 'Número de lugares muito alto'),
  totalCents: money,
  leadId: z.string().min(1).max(128).nullable().optional(),
};
const createSchema = z.object({ tripId: z.string().min(1).max(128, 'Viagem inválida'), ...essentialReservationFields }).strict();
const updateSchema = z.object({
  ...z.object({ ...essentialReservationFields, status: STATUS }).partial().shape,
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict()
  .refine(({ expectedUpdatedAt: _expectedUpdatedAt, ...changes }) => Object.keys(changes).length > 0, { message: 'Informe ao menos um campo para atualizar' });

// Parcelas: mesmas regras de negócio da rota legada (centavos inteiros
// positivos, soma nunca maior que o total, limite de 120, bloqueio de
// edição/exclusão com recebimento marcado, nenhuma alteração em reserva
// cancelada), mas com concorrência sempre ancorada no updatedAt da RESERVA —
// toda mutação de parcela também avança esse timestamp, então uma edição
// concorrente da reserva (ou de outra parcela) é sempre detectada aqui.
const installmentCreateSchema = z.object({
  amountCents: money.min(1, 'Valor da parcela deve ser maior que zero'),
  dueDate: nullableDay.optional(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict();
const installmentUpdateSchema = z.object({
  amountCents: money.min(1, 'Valor da parcela deve ser maior que zero').optional(),
  dueDate: nullableDay.optional(),
  paid: z.boolean().optional(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict()
  .refine(({ expectedUpdatedAt: _expectedUpdatedAt, ...changes }) => Object.keys(changes).length > 0, { message: 'Informe ao menos um campo para atualizar' });
const installmentDeleteSchema = z.object({ expectedUpdatedAt: z.string().datetime({ offset: true }) }).strict();

/** Só aceita um vínculo com interessado se puder validá-lo por completo: precisa existir nesta empresa e, se já estiver associado a uma viagem, ser exatamente esta viagem. Nunca é ignorado em silêncio — ou é válido, ou a requisição é recusada. */
async function checkLead(tx: Prisma.TransactionClient, leadId: string | null | undefined, tripId: string, organizationId: string) {
  if (!leadId) return;
  const lead = await tx.lead.findFirst({ where: { id: leadId, organizationId }, select: { id: true, tripId: true } });
  if (!lead) throw AppError.notFound('Interessado não encontrado nesta empresa.');
  if (lead.tripId && lead.tripId !== tripId) throw AppError.conflict('O interessado está associado a outra viagem.');
}

/** Carrega a reserva (própria empresa + viagem consistente) para uma mutação de parcela e já confirma versão e status: nunca revela nem altera uma reserva de outra empresa, uma reserva alterada por outra pessoa desde a leitura do cliente, ou uma reserva cancelada. */
async function loadReservationForInstallmentWrite(tx: Prisma.TransactionClient, reservationId: string, organizationId: string, expectedUpdatedAt: string) {
  const reservation = await tx.reservation.findFirst({
    where: { id: reservationId, organizationId, trip: { is: { organizationId } } },
    select: { status: true, totalCents: true, updatedAt: true, installments: { select: { id: true, amountCents: true, paidAt: true } } },
  });
  if (!reservation) throw AppError.notFound('Reserva não encontrada.');
  if (reservation.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
    throw AppError.conflict('Esta reserva foi alterada por outra pessoa. Recarregue os dados antes de salvar.');
  }
  if (reservation.status === 'CANCELLED') throw AppError.conflict('Não é possível alterar parcelas de uma reserva cancelada.');
  return reservation;
}

/** Toda mutação de parcela também avança o updatedAt da reserva (nunca só o da própria parcela), com o mesmo compare-and-set por id+organizationId+updatedAt: qualquer mudança concorrente — na própria reserva ou em qualquer outra parcela sua — já faz count divergir de 1. */
async function bumpReservationVersion(tx: Prisma.TransactionClient, reservationId: string, organizationId: string, previousUpdatedAt: Date) {
  const updatedAt = new Date(Math.max(Date.now(), previousUpdatedAt.getTime() + 1));
  const { count } = await tx.reservation.updateMany({ where: { id: reservationId, organizationId, updatedAt: previousUpdatedAt }, data: { updatedAt } });
  if (count !== 1) throw AppError.conflict('Esta reserva foi alterada por outra pessoa. Recarregue os dados antes de salvar.');
}

router.get('/', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const { page, limit } = filters.parse(req.query);
  const organizationId = req.organizationContext!.organization.id;
  // A reservation alone is insufficient proof: a legacy/inconsistent row may
  // reference a trip owned by a different company or by no company at all.
  const where = { organizationId, trip: { is: { organizationId } } };
  const [rows, total] = await prisma.$transaction([
    prisma.reservation.findMany({ where, select, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.reservation.count({ where }),
  ]);
  res.json({ data: rows.map(row => safeReservation(row, organizationId)), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}));

router.get('/:reservationId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const id = z.string().min(1).max(128).parse(req.params.reservationId);
  const organizationId = req.organizationContext!.organization.id;
  const row = await prisma.reservation.findFirst({ where: { id, organizationId, trip: { is: { organizationId } } }, select });
  if (!row) throw AppError.notFound('Reserva não encontrada.');
  res.json(safeReservation(row, organizationId));
}));

router.post('/', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const data = createSchema.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;

  const reservation = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
    // Mesma transação: nunca cria reserva vinculada a uma viagem de outra
    // empresa (a FK do banco garante só que a viagem existe em algum lugar).
    const trip = await tx.trip.findFirst({ where: { id: data.tripId, organizationId }, select: { id: true } });
    if (!trip) throw AppError.notFound('Viagem não encontrada nesta empresa.');
    await checkLead(tx, data.leadId, data.tripId, organizationId);
    const created = await tx.reservation.create({
      data: {
        tripId: data.tripId,
        customerName: data.customerName,
        customerPhone: data.customerPhone ?? null,
        seats: data.seats,
        totalCents: data.totalCents,
        leadId: data.leadId ?? null,
        organizationId,
      },
      select,
    });
    await recordReservationAuditIfOwned(tx, { organizationId, actorUserId: req.user!.id, action: 'RESERVATION_CREATED', entityType: 'Reservation', entityId: created.id, reservationId: created.id });
    return created;
  });
  res.status(201).json(safeReservation(reservation, organizationId));
}));

router.put('/:reservationId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const reservationId = z.string().min(1).max(128).parse(req.params.reservationId);
  const { expectedUpdatedAt, ...data } = updateSchema.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;

  const reservation = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);

    // Mesma consulta de leitura por id+organizationId (+ viagem no mesmo
    // escopo) usada pelas rotas de leitura: nunca revela nem altera uma
    // reserva de outra empresa ou com viagem inconsistente.
    const current = await tx.reservation.findFirst({
      where: { id: reservationId, organizationId, trip: { is: { organizationId } } },
      select: { tripId: true, updatedAt: true, installments: { select: { amountCents: true } } },
    });
    if (!current) throw AppError.notFound('Reserva não encontrada.');
    if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw AppError.conflict('Esta reserva foi alterada por outra pessoa. Recarregue os dados antes de salvar.');
    }

    if (data.leadId !== undefined) await checkLead(tx, data.leadId, current.tripId, organizationId);

    // Parcelas não são criadas/alteradas aqui, mas a regra de negócio
    // existente (total nunca menor que a soma das parcelas) continua valendo
    // mesmo que elas tenham chegado por outro caminho.
    if (data.totalCents !== undefined) {
      const allocated = current.installments.reduce((sum, entry) => sum + entry.amountCents, 0);
      if (data.totalCents < allocated) throw AppError.conflict('O valor total não pode ser menor que a soma das parcelas já registradas.');
    }

    // updatedAt estritamente maior que o anterior (nunca só "now()", que sob
    // escritas muito próximas pode não avançar o bastante) + a própria
    // escrita exige id+organizationId+updatedAt igual ao lido: qualquer
    // mudança concorrente entre a leitura e esta instrução já faz count
    // divergir de 1, nunca perdendo a atualização concorrente em silêncio.
    const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
    const { count } = await tx.reservation.updateMany({
      where: { id: reservationId, organizationId, updatedAt: current.updatedAt },
      data: { ...data, updatedAt },
    });
    if (count !== 1) throw AppError.conflict('Esta reserva foi alterada por outra pessoa. Recarregue os dados antes de salvar.');
    await recordReservationAuditIfOwned(tx, { organizationId, actorUserId: req.user!.id, action: 'RESERVATION_UPDATED', entityType: 'Reservation', entityId: reservationId, reservationId });
    return tx.reservation.findFirst({ where: { id: reservationId, organizationId }, select });
  });
  res.json(safeReservation(reservation!, organizationId));
}));

router.post('/:reservationId/installments', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const reservationId = z.string().min(1).max(128).parse(req.params.reservationId);
  const data = installmentCreateSchema.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;

  const reservation = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
    const current = await loadReservationForInstallmentWrite(tx, reservationId, organizationId, data.expectedUpdatedAt);
    if (current.installments.length >= 120) throw AppError.conflict('A reserva já atingiu o limite de 120 parcelas.');
    const allocated = current.installments.reduce((sum, entry) => sum + entry.amountCents, 0);
    if (allocated + data.amountCents > current.totalCents) throw AppError.conflict('A soma das parcelas não pode ultrapassar o total da reserva.');
    const installment = await tx.reservationInstallment.create({ data: { reservationId, amountCents: data.amountCents, dueDate: dateFromDay(data.dueDate) } });
    await bumpReservationVersion(tx, reservationId, organizationId, current.updatedAt);
    await recordReservationAuditIfOwned(tx, { organizationId, actorUserId: req.user!.id, action: 'INSTALLMENT_CREATED', entityType: 'ReservationInstallment', entityId: installment.id, reservationId });
    return tx.reservation.findFirst({ where: { id: reservationId, organizationId }, select });
  });
  res.status(201).json(safeReservation(reservation!, organizationId));
}));

router.put('/:reservationId/installments/:installmentId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const reservationId = z.string().min(1).max(128).parse(req.params.reservationId);
  const installmentId = z.string().min(1).max(128).parse(req.params.installmentId);
  const data = installmentUpdateSchema.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;

  const reservation = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
    const current = await loadReservationForInstallmentWrite(tx, reservationId, organizationId, data.expectedUpdatedAt);
    // Nunca revela parcela de outra reserva/empresa: só busca dentro das já
    // confirmadas como desta reserva (escopo validado acima).
    const existing = current.installments.find((entry) => entry.id === installmentId);
    if (!existing) throw AppError.notFound('Parcela não encontrada.');
    if (existing.paidAt && (data.amountCents !== undefined || data.dueDate !== undefined)) {
      throw AppError.conflict('Desmarque o recebimento antes de alterar valor ou vencimento.');
    }
    if (data.amountCents !== undefined) {
      const allocated = current.installments.reduce((sum, entry) => sum + (entry.id === installmentId ? data.amountCents! : entry.amountCents), 0);
      if (allocated > current.totalCents) throw AppError.conflict('A soma das parcelas não pode ultrapassar o total da reserva.');
    }
    await tx.reservationInstallment.update({
      where: { id: installmentId },
      data: {
        amountCents: data.amountCents,
        dueDate: data.dueDate === undefined ? undefined : dateFromDay(data.dueDate),
        paidAt: data.paid === undefined ? undefined : data.paid ? existing.paidAt ?? new Date() : null,
      },
    });
    await bumpReservationVersion(tx, reservationId, organizationId, current.updatedAt);
    await recordReservationAuditIfOwned(tx, { organizationId, actorUserId: req.user!.id, action: 'INSTALLMENT_UPDATED', entityType: 'ReservationInstallment', entityId: installmentId, reservationId });
    return tx.reservation.findFirst({ where: { id: reservationId, organizationId }, select });
  });
  res.json(safeReservation(reservation!, organizationId));
}));

// Responde a reserva atualizada (não 204): o cliente precisa do novo
// updatedAt para encadear a próxima mutação de parcela sem recarregar a página.
router.delete('/:reservationId/installments/:installmentId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const reservationId = z.string().min(1).max(128).parse(req.params.reservationId);
  const installmentId = z.string().min(1).max(128).parse(req.params.installmentId);
  const data = installmentDeleteSchema.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;

  const reservation = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
    const current = await loadReservationForInstallmentWrite(tx, reservationId, organizationId, data.expectedUpdatedAt);
    const existing = current.installments.find((entry) => entry.id === installmentId);
    if (!existing) throw AppError.notFound('Parcela não encontrada.');
    if (existing.paidAt) throw AppError.conflict('Desmarque o recebimento antes de excluir a parcela.');
    await tx.reservationInstallment.delete({ where: { id: installmentId } });
    await bumpReservationVersion(tx, reservationId, organizationId, current.updatedAt);
    await recordReservationAuditIfOwned(tx, { organizationId, actorUserId: req.user!.id, action: 'INSTALLMENT_DELETED', entityType: 'ReservationInstallment', entityId: installmentId, reservationId });
    return tx.reservation.findFirst({ where: { id: reservationId, organizationId }, select });
  });
  res.json(safeReservation(reservation!, organizationId));
}));

// Só OWNER/ADMIN desta empresa (mesmo guard do router inteiro). Mesmo escopo
// de leitura das demais rotas: reserva de outra empresa, ou cuja viagem
// pertença a outra empresa, não é nem encontrada — a auditoria nunca revela
// se uma reserva de outra empresa existe.
router.get('/:reservationId/audit', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const reservationId = z.string().min(1).max(128).parse(req.params.reservationId);
  const { page, limit } = filters.parse(req.query);
  const organizationId = req.organizationContext!.organization.id;
  const reservation = await prisma.reservation.findFirst({ where: { id: reservationId, organizationId, trip: { is: { organizationId } } }, select: { id: true } });
  if (!reservation) throw AppError.notFound('Reserva não encontrada.');
  const where = { organizationId, reservationId };
  const [rows, total] = await prisma.$transaction([
    prisma.reservationAuditLog.findMany({ where, select: auditSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.reservationAuditLog.count({ where }),
  ]);
  res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}));

export default router;
