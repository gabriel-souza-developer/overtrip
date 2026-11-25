import { randomBytes } from 'node:crypto';
import { Router, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { assertOrganizationWriteAccess, requireOrganizationMembership, type OrganizationRequest } from '../middleware/organizationContext.js';
import { applySearchFilter, normalizeForSearch } from '../utils/searchUtils.js';
import { assertOwnedImages, filterOwnedImages, parseStoredImages, serveOwnedMediaFile } from '../services/organizationOwnedMedia.js';

const router = Router({ mergeParams: true });
router.use(requireOrganizationMembership());

const filters = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  isFeatured: z.enum(['true', 'false']).optional(),
}).strict();
const select = { id: true, title: true, date: true, dateDisplay: true, description: true, isFeatured: true, images: true, source: true, updatedAt: true } as const;
const ownGallery = (organizationId: string): Prisma.GalleryEntryWhereInput => ({
  AND: [
    { organizationId },
    { OR: [{ tripId: null }, { trip: { is: { organizationId } } }] },
    { OR: [{ visitId: null }, { visit: { is: { organizationId, OR: [{ tripId: null }, { trip: { is: { organizationId } } }] } } }] },
  ],
});

async function presentGallery<T extends { images: string; source: string | null }>(organizationId: string, rows: T[]) {
  // Limite 5: o mesmo máximo aceito por essentialGalleryFields.images abaixo
  // — um limite menor aqui descartaria silenciosamente fotos já salvas, e o
  // formulário reenviaria só as que sobraram ao salvar qualquer outro campo.
  const parsed = rows.map((row) => parseStoredImages(row.images, 5));
  const rewritten = await filterOwnedImages(prisma, organizationId, parsed, (filename) => `/api/organizations/${encodeURIComponent(organizationId)}/tourism/gallery/media/${filename}`);
  return rows.map(({ images: _images, source, ...row }, index) => ({ ...row, images: rewritten[index], canEdit: source === 'manual' }));
}

router.get('/media/:file', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  await serveOwnedMediaFile(res, prisma, req.organizationContext!.organization.id, req.params.file);
}));

router.get('/', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const query = filters.parse(req.query);
  const organizationId = req.organizationContext!.organization.id;
  const clauses: Prisma.GalleryEntryWhereInput[] = [ownGallery(organizationId)];
  if (query.isFeatured) clauses.push({ isFeatured: query.isFeatured === 'true' });
  const matches = applySearchFilter(query.search, ['titleSearch', 'descriptionSearch']);
  if (matches) clauses.push({ OR: matches });
  const where: Prisma.GalleryEntryWhereInput = { AND: clauses };
  const [rows, total] = await prisma.$transaction([
    prisma.galleryEntry.findMany({ where, select, orderBy: [{ isFeatured: 'desc' }, { orderIndex: 'asc' }, { date: 'desc' }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.galleryEntry.count({ where }),
  ]);
  res.json({ data: await presentGallery(organizationId, rows), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } });
}));

router.get('/:entryId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const id = z.string().min(1).max(128).parse(req.params.entryId);
  const entry = await prisma.galleryEntry.findFirst({ where: { id, ...ownGallery(req.organizationContext!.organization.id) }, select });
  if (!entry) throw AppError.notFound('Memória não encontrada');
  const [presented] = await presentGallery(req.organizationContext!.organization.id, [entry]);
  res.json(presented);
}));

const imageItem = z.object({ src: z.string().trim().min(1).max(300), alt: z.string().trim().min(1, 'Descreva o que aparece na foto').max(300) }).strict();
// Só os dados essenciais de uma memória: nunca organizationId, tripId,
// visitId, storedIdentity, source, isFeatured ou orderIndex — curadoria de
// destaque e ordenação continuam só da operação legada por ora.
const essentialGalleryFields = {
  title: z.string().trim().min(1, 'Título é obrigatório').max(200, 'Título longo demais'),
  date: z.string().datetime({ offset: true, message: 'Data inválida (ISO 8601 com timezone)' }),
  dateDisplay: z.string().trim().min(1, 'Informe a data por extenso').max(80, 'Texto da data longo demais'),
  description: z.string().trim().min(1, 'Descrição é obrigatória').max(3000, 'Descrição longa demais'),
  images: z.array(imageItem).min(1, 'Adicione ao menos uma foto').max(5),
};
const createSchema = z.object(essentialGalleryFields).strict();
const updateSchema = z.object({ ...z.object(essentialGalleryFields).partial().shape, expectedUpdatedAt: z.string().datetime({ offset: true }) }).strict()
  .refine(({ expectedUpdatedAt: _expectedUpdatedAt, ...changes }) => Object.keys(changes).length > 0, { message: 'Informe ao menos um campo para atualizar' });

router.post('/', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const data = createSchema.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;

  const entry = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
    const images = await assertOwnedImages(tx, organizationId, data.images);
    const storedIdentity = `org-gallery:${organizationId}:${randomBytes(16).toString('hex')}`;
    // Entra sempre no fim da ordem manual, nunca em destaque: a curadoria de
    // destaque é decidida depois, não na criação.
    const maxOrder = await tx.galleryEntry.aggregate({ where: { organizationId }, _max: { orderIndex: true } });
    return tx.galleryEntry.create({
      data: {
        title: data.title,
        date: new Date(data.date),
        dateDisplay: data.dateDisplay,
        description: data.description,
        images,
        isFeatured: false,
        orderIndex: (maxOrder._max.orderIndex ?? 0) + 1,
        storedIdentity,
        source: 'manual',
        organizationId,
        titleSearch: normalizeForSearch(data.title),
        descriptionSearch: normalizeForSearch(data.description),
      },
      select,
    });
  });
  const [presented] = await presentGallery(organizationId, [entry]);
  res.status(201).json(presented);
}));

router.put('/:entryId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const entryId = z.string().min(1).max(128).parse(req.params.entryId);
  const { expectedUpdatedAt, ...data } = updateSchema.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;

  const entry = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);

    // Só uma memória criada pela própria empresa ("manual") pode ser editada
    // aqui — nunca uma curadoria importada do acervo legado.
    const current = await tx.galleryEntry.findFirst({ where: { id: entryId, ...ownGallery(organizationId), source: 'manual' }, select: { updatedAt: true } });
    if (!current) throw AppError.notFound('Memória não encontrada');
    if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw AppError.conflict('Esta memória foi alterada por outra pessoa. Recarregue os dados antes de salvar.');
    }

    const images = data.images === undefined ? undefined : await assertOwnedImages(tx, organizationId, data.images);
    const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
    const { count } = await tx.galleryEntry.updateMany({
      where: { id: entryId, ...ownGallery(organizationId), source: 'manual', updatedAt: current.updatedAt },
      data: {
        updatedAt,
        ...(data.title !== undefined ? { title: data.title, titleSearch: normalizeForSearch(data.title) } : {}),
        ...(data.date !== undefined ? { date: new Date(data.date) } : {}),
        ...(data.dateDisplay !== undefined ? { dateDisplay: data.dateDisplay } : {}),
        ...(data.description !== undefined ? { description: data.description, descriptionSearch: normalizeForSearch(data.description) } : {}),
        ...(images !== undefined ? { images } : {}),
      },
    });
    if (count !== 1) throw AppError.conflict('Esta memória foi alterada por outra pessoa. Recarregue os dados antes de salvar.');
    return tx.galleryEntry.findFirst({ where: { id: entryId, organizationId }, select });
  });
  const [presented] = await presentGallery(organizationId, [entry!]);
  res.json(presented);
}));

// Lacuna identificada comparando o painel da empresa com o operador legado:
// memórias podiam ser criadas e editadas pela própria empresa, mas nunca
// excluídas. Nunca exclui uma memória importada do acervo legado (source !=
// 'manual'), mesma restrição já aplicada ao PUT. Diferente de destino,
// nenhuma tabela referencia GalleryEntry por FK (ver prisma/schema.prisma):
// não há vínculo a conferir antes de excluir. A foto em si (MediaAsset)
// nunca é apagada aqui: é só referenciada por `src` no JSON, nunca por FK,
// então continua disponível para a empresa reaproveitar em outro lugar.
router.delete('/:entryId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const entryId = z.string().min(1).max(128).parse(req.params.entryId);
  const organizationId = req.organizationContext!.organization.id;

  await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
    // deleteMany (nunca delete simples) para que uma exclusão concorrente
    // da mesma linha dê 404 (nenhuma linha afetada) em vez de um erro de
    // "registro não encontrado" sem tratamento.
    const { count } = await tx.galleryEntry.deleteMany({ where: { id: entryId, ...ownGallery(organizationId), source: 'manual' } });
    if (count !== 1) throw AppError.notFound('Memória não encontrada');
  });
  res.status(204).send();
}));

export default router;
