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

// Todos os membros podem consultar os mesmos campos operacionais, sem notas,
// imagens privadas ou relações cujo titular seja outra empresa.
const select = { id: true, title: true, description: true, date: true, city: true, region: true, lat: true, lng: true, needsReview: true, images: true, source: true, updatedAt: true } as const;
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

// Só a foto JÁ enviada por esta empresa é devolvida, nunca a de outra
// organização. Ver filterOwnedImages: `src` fica canônico (o formulário
// reenvia exatamente esse valor ao editar sem trocar a foto); `previewSrc`
// é a rota de leitura própria da empresa, para exibir a miniatura mesmo
// fora de PUBLIC_SITE_ORGANIZATION_IDS.
async function presentVisits<T extends { images: string | null; source: string | null }>(organizationId: string, rows: T[]) {
  const parsed = rows.map((row) => parseStoredImages(row.images, 5));
  const rewritten = await filterOwnedImages(prisma, organizationId, parsed, (filename) => `/api/organizations/${encodeURIComponent(organizationId)}/tourism/visits/media/${filename}`);
  return rows.map(({ images: _images, source, ...row }, index) => ({ ...row, images: rewritten[index], canEdit: source === 'manual' }));
}

router.get('/media/:file', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  await serveOwnedMediaFile(res, prisma, req.organizationContext!.organization.id, req.params.file);
}));

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
  const [rows, total] = await prisma.$transaction([
    prisma.visit.findMany({ where, select, orderBy: [{ date: 'desc' }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.visit.count({ where }),
  ]);
  res.json({ data: await presentVisits(organizationId, rows), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } });
}));

router.get('/:visitId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const id = z.string().min(1).max(128).parse(req.params.visitId);
  const visit = await prisma.visit.findFirst({ where: { id, ...ownVisit(req.organizationContext!.organization.id) }, select });
  if (!visit) throw AppError.notFound('Destino não encontrado');
  const [presented] = await presentVisits(req.organizationContext!.organization.id, [visit]);
  res.json(presented);
}));

const imageItem = z.object({ src: z.string().trim().min(1).max(300), alt: z.string().trim().min(1, 'Descreva o que aparece na foto').max(300) }).strict();
// Só os dados essenciais de um destino: nunca organizationId, tripId,
// storedIdentity, source ou needsReview — campos fora desta lista são
// rejeitados pelo .strict(), nunca ignorados em silêncio.
const essentialVisitFields = {
  title: z.string().trim().min(1, 'Título é obrigatório').max(200, 'Título longo demais'),
  description: z.union([z.string().trim().max(3000), z.literal(''), z.null()]).optional(),
  date: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
  city: z.string().trim().min(1, 'Cidade é obrigatória').max(120, 'Cidade longa demais'),
  region: z.string().trim().min(1, 'Região é obrigatória').max(60, 'Região longa demais'),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  images: z.array(imageItem).max(5).optional(),
};
const createSchema = z.object(essentialVisitFields).strict()
  .refine((data) => (data.lat == null) === (data.lng == null), { message: 'Informe latitude e longitude juntas, ou nenhuma das duas.' });
const updateSchema = z.object({ ...z.object(essentialVisitFields).partial().shape, expectedUpdatedAt: z.string().datetime({ offset: true }) }).strict()
  .refine(({ expectedUpdatedAt: _expectedUpdatedAt, ...changes }) => Object.keys(changes).length > 0, { message: 'Informe ao menos um campo para atualizar' });

router.post('/', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const data = createSchema.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;

  const visit = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
    const images = await assertOwnedImages(tx, organizationId, data.images ?? []);
    // 128 bits aleatórios, nunca aceitos do cliente: mesmo padrão já usado em
    // viagens e mídia (reserveStorageKey) para identificar o registro.
    const storedIdentity = `org-visit:${organizationId}:${randomBytes(16).toString('hex')}`;
    return tx.visit.create({
      data: {
        title: data.title,
        description: data.description || null,
        date: data.date ? new Date(data.date) : null,
        city: data.city,
        region: data.region,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        images,
        storedIdentity,
        // "manual": só estes registros podem ser editados depois (ver PUT).
        // Nunca altera a revisão de um destino importado do acervo legado.
        source: 'manual',
        needsReview: false,
        organizationId,
        titleSearch: normalizeForSearch(data.title),
        citySearch: normalizeForSearch(data.city),
        regionSearch: normalizeForSearch(data.region),
      },
      select,
    });
  });
  const [presented] = await presentVisits(organizationId, [visit]);
  res.status(201).json(presented);
}));

router.put('/:visitId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const visitId = z.string().min(1).max(128).parse(req.params.visitId);
  const { expectedUpdatedAt, ...data } = updateSchema.parse(req.body);
  const organizationId = req.organizationContext!.organization.id;

  const visit = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);

    // Só um destino criado pela própria empresa ("manual") pode ser editado
    // aqui — nunca um registro importado do acervo legado, mesmo que já
    // pertença a esta organização (preserva o histórico de curadoria dele).
    const current = await tx.visit.findFirst({ where: { id: visitId, ...ownVisit(organizationId), source: 'manual' }, select: { lat: true, lng: true, updatedAt: true } });
    if (!current) throw AppError.notFound('Destino não encontrado');
    if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw AppError.conflict('Este destino foi alterado por outra pessoa. Recarregue os dados antes de salvar.');
    }

    const nextLat = data.lat === undefined ? current.lat : data.lat;
    const nextLng = data.lng === undefined ? current.lng : data.lng;
    if ((nextLat == null) !== (nextLng == null)) throw AppError.badRequest('Informe latitude e longitude juntas, ou nenhuma das duas.');

    const images = data.images === undefined ? undefined : await assertOwnedImages(tx, organizationId, data.images);
    const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
    const { count } = await tx.visit.updateMany({
      where: { id: visitId, ...ownVisit(organizationId), source: 'manual', updatedAt: current.updatedAt },
      data: {
        updatedAt,
        ...(data.title !== undefined ? { title: data.title, titleSearch: normalizeForSearch(data.title) } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.date !== undefined ? { date: data.date ? new Date(data.date) : null } : {}),
        ...(data.city !== undefined ? { city: data.city, citySearch: normalizeForSearch(data.city) } : {}),
        ...(data.region !== undefined ? { region: data.region, regionSearch: normalizeForSearch(data.region) } : {}),
        ...(data.lat !== undefined ? { lat: data.lat } : {}),
        ...(data.lng !== undefined ? { lng: data.lng } : {}),
        ...(images !== undefined ? { images } : {}),
      },
    });
    if (count !== 1) throw AppError.conflict('Este destino foi alterado por outra pessoa. Recarregue os dados antes de salvar.');
    return tx.visit.findFirst({ where: { id: visitId, organizationId }, select });
  });
  const [presented] = await presentVisits(organizationId, [visit!]);
  res.json(presented);
}));

// Lacuna identificada comparando o painel da empresa com o operador legado:
// destinos podiam ser criados e editados pela própria empresa, mas nunca
// excluídos. Mesma defesa em duas camadas da exclusão legada
// (visitService.delete em src/services/index.ts): conta pelo próprio escopo
// (mensagem informativa) e pelo total sem filtro (detecta um vínculo que,
// por alguma inconsistência fora desta API, apontasse para outra empresa);
// a exclusão nunca é tentada quando as duas contagens não coincidem. Nunca
// exclui um destino importado do acervo legado (source != 'manual'), mesmo
// que já pertença a esta organização — mesma restrição já aplicada ao PUT.
// A foto em si (MediaAsset) nunca é apagada aqui: é só referenciada por
// `src` no JSON, nunca por FK, então continua disponível para a empresa
// reaproveitar em outro destino ou memória mesmo depois desta exclusão.
router.delete('/:visitId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const visitId = z.string().min(1).max(128).parse(req.params.visitId);
  const organizationId = req.organizationContext!.organization.id;

  await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);

    const visit = await tx.visit.findFirst({ where: { id: visitId, ...ownVisit(organizationId), source: 'manual' }, select: { id: true } });
    if (!visit) throw AppError.notFound('Destino não encontrado');

    const [ownGallery, totalGallery] = await Promise.all([
      tx.galleryEntry.count({ where: { visitId, organizationId } }),
      tx.galleryEntry.count({ where: { visitId } }),
    ]);
    if (ownGallery > 0) {
      throw AppError.badRequest('Não é possível excluir destino com memórias da galeria associadas. Remova as associações primeiro.', { galleryEntries: ownGallery });
    }
    if (totalGallery > ownGallery) {
      throw AppError.conflict('Não é possível excluir destino: existem registros vinculados.');
    }

    // deleteMany (nunca delete simples) para que uma exclusão concorrente da
    // mesma linha, entre a conferência acima e aqui, dê 404 (nenhuma linha
    // afetada) em vez de um erro de "registro não encontrado" sem tratamento.
    const { count } = await tx.visit.deleteMany({ where: { id: visitId, ...ownVisit(organizationId), source: 'manual' } });
    if (count !== 1) throw AppError.notFound('Destino não encontrado');
  });
  res.status(204).send();
}));

export default router;
