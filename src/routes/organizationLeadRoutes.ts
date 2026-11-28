import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { assertOrganizationWriteAccess, requireOrganizationMembership, type OrganizationRequest } from '../middleware/organizationContext.js';
import { startOfTomorrowInBusinessZone } from '../lib/businessTime.js';

// Parent router authenticates and sets no-store. Global account roles are not
// consulted: private contact data requires an owner/admin membership here.
const router = Router({ mergeParams: true });
router.use(requireOrganizationMembership('OWNER', 'ADMIN'));
// Apenas OWNER/ADMIN acessam esta projeção, inclusive anotações; eventos
// privados de histórico continuam fora da resposta.
const select = {
  id: true, name: true, phone: true, email: true, stage: true,
  notes: true,
  responsible: true, nextFollowUpAt: true, createdAt: true, updatedAt: true,
  trip: { select: { id: true, organizationId: true } },
} as const;
type LeadProjection = {
  id: string; name: string; phone: string | null; email: string | null; stage: string;
  responsible: string | null; notes: string | null; nextFollowUpAt: Date | null; createdAt: Date; updatedAt: Date;
  trip: { id: string; organizationId: string | null } | null;
};
// Until ownership constraints are enforced in the DB, never reveal even the
// ID of a linked trip whose ownership is different or still unassigned.
function safeLead({ trip, ...lead }: LeadProjection, organizationId: string) {
  return { ...lead, tripId: trip?.organizationId === organizationId ? trip.id : null };
}
const STAGE = z.enum(['NEW', 'CONTACTED', 'NEGOTIATING', 'WON', 'LOST']);
const filters = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  stage: STAGE.optional(),
  followUp: z.enum(['due']).optional(),
}).strict();

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
// Dados de contato e acompanhamento — nunca organizationId, tripId ou qualquer
// campo fora dessa lista, que o .strict() rejeita. Vincular a uma viagem
// exigiria reconferir, na mesma transação, tanto o escopo da viagem quanto a
// coerência com reservas já vinculadas ao interessado; para manter o MVP sem
// ampliar esse risco, a ligação com viagem não é aceita aqui (fica para uma
// entrega futura, deliberadamente fora deste escopo).
const essentialLeadFields = {
  name: z.string().trim().min(1, 'Nome é obrigatório').max(120, 'Nome longo demais'),
  phone: nullableText(40),
  email: z.union([z.email('E-mail inválido').max(254), z.literal(''), z.null()]).optional(),
  stage: STAGE.optional(),
  notes: nullableText(3000),
  responsible: nullableText(120),
  nextFollowUpAt: z.union([z.iso.datetime({ offset: true }), z.null()]).optional(),
};
const hasContact = (data: { phone?: string | null; email?: string | null }) => !!(data.phone && data.phone.trim()) || !!(data.email);
const createSchema = z.object(essentialLeadFields).strict()
  .refine(hasContact, { message: 'Informe telefone ou e-mail para contato.' });
const updateSchema = z.object({ ...z.object(essentialLeadFields).partial().shape, expectedUpdatedAt: z.string().datetime({ offset: true }) }).strict()
  .refine(({ expectedUpdatedAt: _expectedUpdatedAt, ...changes }) => Object.keys(changes).length > 0, { message: 'Informe ao menos um campo para atualizar' });
const clean = <T extends Record<string, unknown>>(data: T) => Object.fromEntries(
  Object.entries(data).map(([k, v]) => [k, v === '' ? null : v]),
);

router.get('/', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const { page, limit, stage, followUp } = filters.parse(req.query);
  const organizationId = req.organizationContext!.organization.id;
  const where = { organizationId, ...(stage ? { stage } : {}), ...(followUp === 'due' ? { nextFollowUpAt: { not: null, lt: startOfTomorrowInBusinessZone() } } : {}) };
  const orderBy = followUp === 'due' ? [{ nextFollowUpAt: 'asc' as const }, { updatedAt: 'desc' as const }, { id: 'asc' as const }] : [{ updatedAt: 'desc' as const }, { id: 'asc' as const }];
  const [rows, total] = await prisma.$transaction([
    prisma.lead.findMany({ where, select, orderBy, skip: (page - 1) * limit, take: limit }),
    prisma.lead.count({ where }),
  ]);
  res.json({ data: rows.map(row => safeLead(row, organizationId)), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}));

router.get('/:leadId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const id = z.string().min(1).max(128).parse(req.params.leadId);
  const organizationId = req.organizationContext!.organization.id;
  const lead = await prisma.lead.findFirst({ where: { id, organizationId }, select });
  if (!lead) throw AppError.notFound('Interessado não encontrado');
  res.json(safeLead(lead, organizationId));
}));

router.post('/', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const data = createSchema.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;

  const lead = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
    return tx.lead.create({
      data: {
        ...clean(data),
        name: data.name,
        stage: data.stage ?? 'NEW',
        organizationId,
      },
      select,
    });
  });
  res.status(201).json(safeLead(lead, organizationId));
}));

router.put('/:leadId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const leadId = z.string().min(1).max(128).parse(req.params.leadId);
  const { expectedUpdatedAt, ...data } = updateSchema.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;

  const lead = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);

    const current = await tx.lead.findFirst({ where: { id: leadId, organizationId }, select: { phone: true, email: true, updatedAt: true } });
    // Não revela interessados de outra empresa.
    if (!current) throw AppError.notFound('Interessado não encontrado');
    if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw AppError.conflict('Este interessado foi alterado por outra pessoa. Recarregue os dados antes de salvar.');
    }
    const nextPhone = data.phone === undefined ? current.phone : (data.phone || null);
    const nextEmail = data.email === undefined ? current.email : (data.email || null);
    if (!hasContact({ phone: nextPhone, email: nextEmail })) {
      throw AppError.badRequest('O interessado precisa manter telefone ou e-mail para contato.');
    }

    // A própria escrita exige id+organizationId (nunca só id): mesmo que
    // algo tivesse mudado entre a consulta acima e agora, esta instrução
    // nunca alteraria um interessado de outra empresa.
    const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
    const { count } = await tx.lead.updateMany({ where: { id: leadId, organizationId, updatedAt: current.updatedAt }, data: { ...clean(data), updatedAt } });
    if (count !== 1) throw AppError.conflict('Este interessado foi alterado por outra pessoa. Recarregue os dados antes de salvar.');
    return tx.lead.findFirst({ where: { id: leadId, organizationId }, select });
  });
  res.json(safeLead(lead!, organizationId));
}));

export default router;
