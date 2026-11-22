import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { assertSocialMediaAvailable } from './socialMediaRoutes.js';
import {
  socialPostId as id, socialPostCreateSchema as createSchema, socialPostUpdateSchema as updateSchema,
  socialPostRevisionSchema as revisionSchema, socialPostInclude as include,
} from '../validators/socialPost.js';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(authenticate, authorize('admin'));

// Acervo legado: toda leitura, contagem, escrita e vínculo de imagem abaixo
// é restrita a organizationId null, para nunca alcançar rascunhos ou
// imagens de uma empresa (ver organizationSocialPostRoutes.ts para essas).
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const query = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict().parse(req.query);
  const where = { organizationId: null };
  const [data, total] = await prisma.$transaction([
    prisma.socialPost.findMany({ where, include, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.socialPost.count({ where }),
  ]);
  res.json({ data, pagination: { ...query, total, totalPages: Math.ceil(total / query.limit) } });
}));
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const post = await prisma.socialPost.findFirst({ where: { id: id.parse(req.params.id), organizationId: null }, include });
  if (!post) throw AppError.notFound('Rascunho não encontrado.');
  res.json(post);
}));
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const input = createSchema.parse(req.body);
  const post = await prisma.$transaction(async tx => {
    const mediaIds = [...new Set(input.variants.flatMap(v => v.socialMediaId ? [v.socialMediaId] : []))];
    if (mediaIds.length && await tx.socialMedia.count({ where: { id: { in: mediaIds }, organizationId: null } }) !== mediaIds.length) throw AppError.badRequest('Imagem não encontrada.');
    return tx.socialPost.create({ data: { title: input.title, variants: { create: input.variants } }, include });
  });
  res.status(201).json(post);
}));
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const postId = id.parse(req.params.id);
  const input = updateSchema.parse(req.body);
  const post = await prisma.$transaction(async tx => {
    const mediaIds = [...new Set(input.variants.flatMap(v => v.socialMediaId ? [v.socialMediaId] : []))];
    if (mediaIds.length && await tx.socialMedia.count({ where: { id: { in: mediaIds }, organizationId: null } }) !== mediaIds.length) throw AppError.badRequest('Imagem não encontrada.');
    // A versão impede que uma edição sobrescreva uma revisão concorrente.
    const result = await tx.socialPost.updateMany({ where: { id: postId, organizationId: null, version: input.version }, data: { title: input.title, approvedAt: null, version: { increment: 1 } } });
    if (!result.count) {
      if (!await tx.socialPost.findFirst({ where: { id: postId, organizationId: null }, select: { id: true } })) throw AppError.notFound('Rascunho não encontrado.');
      throw AppError.conflict('Este rascunho foi alterado. Atualize a página e revise novamente.');
    }
    await tx.socialPostVariant.deleteMany({ where: { postId } });
    await tx.socialPostVariant.createMany({ data: input.variants.map(v => ({ ...v, postId })) });
    return tx.socialPost.findUniqueOrThrow({ where: { id: postId }, include });
  });
  res.json(post);
}));
router.post('/:id/approve', asyncHandler(async (req: Request, res: Response) => {
  const postId = id.parse(req.params.id);
  const input = revisionSchema.parse(req.body);
  const post = await prisma.$transaction(async tx => {
    const current = await tx.socialPost.findFirst({ where: { id: postId, organizationId: null }, include });
    if (!current) throw AppError.notFound('Rascunho não encontrado.');
    if (current.version !== input.version) throw AppError.conflict('Este rascunho foi alterado. Atualize a página e revise novamente.');
    if (!current.variants.length || current.variants.some(item => !item.caption.trim())) throw AppError.badRequest('Preencha as legendas de todas as redes antes de aprovar.');
    const mediaIds = [...new Set(current.variants.flatMap(item => item.socialMediaId ? [item.socialMediaId] : []))];
    const media = await tx.socialMedia.findMany({ where: { id: { in: mediaIds }, organizationId: null }, select: { storageKey: true, sha256: true } });
    if (media.length !== mediaIds.length) throw AppError.badRequest('Imagem não encontrada.');
    await Promise.all(media.map(item => assertSocialMediaAvailable(item.storageKey, item.sha256)));
    const updated = await tx.socialPost.updateMany({ where: { id: postId, organizationId: null, version: input.version }, data: { approvedAt: new Date(), version: { increment: 1 } } });
    if (!updated.count) throw AppError.conflict('Este rascunho foi alterado. Atualize a página e revise novamente.');
    return tx.socialPost.findUniqueOrThrow({ where: { id: postId }, include });
  });
  res.json(post);
}));
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const postId = id.parse(req.params.id);
  const input = revisionSchema.parse(req.body);
  const result = await prisma.socialPost.deleteMany({ where: { id: postId, organizationId: null, version: input.version } });
  if (!result.count) {
    if (!await prisma.socialPost.findFirst({ where: { id: postId, organizationId: null }, select: { id: true } })) throw AppError.notFound('Rascunho não encontrado.');
    throw AppError.conflict('Este rascunho foi alterado. Atualize a página antes de excluir.');
  }
  res.status(204).end();
}));
export default router;
