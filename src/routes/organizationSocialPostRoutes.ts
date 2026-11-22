import { Router, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { assertOrganizationWriteAccess, requireOrganizationMembership, type OrganizationRequest } from '../middleware/organizationContext.js';
import { assertSocialMediaAvailable } from './socialMediaRoutes.js';
import {
  socialPostId as id, socialPostCreateSchema as createSchema, socialPostUpdateSchema as updateSchema,
  socialPostRevisionSchema as revisionSchema, socialPostInclude as include,
} from '../validators/socialPost.js';

// Montada em /:organizationId/tourism/social-posts. Mesmo formato e regras
// de concorrência (campo version) da rota legada (/api/social-posts),
// reaproveitados via validators/socialPost.ts, mas toda consulta e escrita
// é filtrada por organizationId: nunca lista, edita, aprova ou exclui um
// rascunho de outra empresa ou do acervo legado (organizationId nulo), e
// nunca vincula uma imagem social de outra empresa. Redes sociais é
// informação sensível de divulgação, como Interessados e Reservas: só
// OWNER/ADMIN leem (menu e rota direta), e só OWNER/ADMIN escrevem,
// revalidado dentro de cada transação de escrita.
const router = Router({ mergeParams: true });
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

async function assertOwnedMedia(tx: Prisma.TransactionClient, organizationId: string, mediaIds: string[]) {
  if (mediaIds.length && await tx.socialMedia.count({ where: { id: { in: mediaIds }, organizationId } }) !== mediaIds.length) {
    throw AppError.badRequest('Imagem não encontrada.');
  }
}

router.get('/', requireOrganizationMembership('OWNER', 'ADMIN'), asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const organizationId = req.organizationContext!.organization.id;
  const query = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict().parse(req.query);
  const where = { organizationId };
  const [data, total] = await prisma.$transaction([
    prisma.socialPost.findMany({ where, include, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.socialPost.count({ where }),
  ]);
  res.json({ data, pagination: { ...query, total, totalPages: Math.ceil(total / query.limit) } });
}));

router.get('/:id', requireOrganizationMembership('OWNER', 'ADMIN'), asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const organizationId = req.organizationContext!.organization.id;
  const post = await prisma.socialPost.findFirst({ where: { id: id.parse(req.params.id), organizationId }, include });
  if (!post) throw AppError.notFound('Rascunho não encontrado.');
  res.json(post);
}));

router.post('/', requireOrganizationMembership('OWNER', 'ADMIN'), asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const organizationId = req.organizationContext!.organization.id;
  const input = createSchema.parse(req.body);
  const post = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
    const mediaIds = [...new Set(input.variants.flatMap((v) => (v.socialMediaId ? [v.socialMediaId] : [])))];
    await assertOwnedMedia(tx, organizationId, mediaIds);
    return tx.socialPost.create({ data: { title: input.title, organizationId, variants: { create: input.variants } }, include });
  });
  res.status(201).json(post);
}));

router.put('/:id', requireOrganizationMembership('OWNER', 'ADMIN'), asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const organizationId = req.organizationContext!.organization.id;
  const postId = id.parse(req.params.id);
  const input = updateSchema.parse(req.body);
  const post = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
    const mediaIds = [...new Set(input.variants.flatMap((v) => (v.socialMediaId ? [v.socialMediaId] : [])))];
    await assertOwnedMedia(tx, organizationId, mediaIds);
    // A versão impede que uma edição sobrescreva uma revisão concorrente.
    const result = await tx.socialPost.updateMany({ where: { id: postId, organizationId, version: input.version }, data: { title: input.title, approvedAt: null, version: { increment: 1 } } });
    if (!result.count) {
      if (!await tx.socialPost.findFirst({ where: { id: postId, organizationId }, select: { id: true } })) throw AppError.notFound('Rascunho não encontrado.');
      throw AppError.conflict('Este rascunho foi alterado. Atualize a página e revise novamente.');
    }
    await tx.socialPostVariant.deleteMany({ where: { postId } });
    await tx.socialPostVariant.createMany({ data: input.variants.map((v) => ({ ...v, postId })) });
    return tx.socialPost.findUniqueOrThrow({ where: { id: postId }, include });
  });
  res.json(post);
}));

router.post('/:id/approve', requireOrganizationMembership('OWNER', 'ADMIN'), asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const organizationId = req.organizationContext!.organization.id;
  const postId = id.parse(req.params.id);
  const input = revisionSchema.parse(req.body);
  const post = await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
    const current = await tx.socialPost.findFirst({ where: { id: postId, organizationId }, include });
    if (!current) throw AppError.notFound('Rascunho não encontrado.');
    if (current.version !== input.version) throw AppError.conflict('Este rascunho foi alterado. Atualize a página e revise novamente.');
    if (!current.variants.length || current.variants.some((item) => !item.caption.trim())) throw AppError.badRequest('Preencha as legendas de todas as redes antes de aprovar.');
    const mediaIds = [...new Set(current.variants.flatMap((item) => (item.socialMediaId ? [item.socialMediaId] : [])))];
    const media = await tx.socialMedia.findMany({ where: { id: { in: mediaIds }, organizationId }, select: { storageKey: true, sha256: true } });
    if (media.length !== mediaIds.length) throw AppError.badRequest('Imagem não encontrada.');
    await Promise.all(media.map((item) => assertSocialMediaAvailable(item.storageKey, item.sha256)));
    const updated = await tx.socialPost.updateMany({ where: { id: postId, organizationId, version: input.version }, data: { approvedAt: new Date(), version: { increment: 1 } } });
    if (!updated.count) throw AppError.conflict('Este rascunho foi alterado. Atualize a página e revise novamente.');
    return tx.socialPost.findUniqueOrThrow({ where: { id: postId }, include });
  });
  res.json(post);
}));

router.delete('/:id', requireOrganizationMembership('OWNER', 'ADMIN'), asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const organizationId = req.organizationContext!.organization.id;
  const postId = id.parse(req.params.id);
  const input = revisionSchema.parse(req.body);
  await prisma.$transaction(async (tx) => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
    const result = await tx.socialPost.deleteMany({ where: { id: postId, organizationId, version: input.version } });
    if (!result.count) {
      if (!await tx.socialPost.findFirst({ where: { id: postId, organizationId }, select: { id: true } })) throw AppError.notFound('Rascunho não encontrado.');
      throw AppError.conflict('Este rascunho foi alterado. Atualize a página antes de excluir.');
    }
  });
  res.status(204).end();
}));

export default router;
