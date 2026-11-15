import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(authenticate, authorize('admin'));
const id = z.string().min(1).max(128);
const version = z.number().int().min(1).max(2_147_483_646);
const variant = z.object({ platform: z.enum(['INSTAGRAM', 'FACEBOOK', 'TIKTOK']), caption: z.string().trim().max(5000) }).strict();
const variants = z.array(variant).min(1).max(3).refine(items => new Set(items.map(item => item.platform)).size === items.length, 'Cada rede deve aparecer apenas uma vez.');
const content = { title: z.string().trim().min(1).max(160), variants };
const createSchema = z.object(content).strict();
const updateSchema = z.object({ ...content, version }).strict();
const revisionSchema = z.object({ version }).strict();
const include = { variants: { select: { platform: true, caption: true }, orderBy: { platform: 'asc' as const } } };

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const query = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict().parse(req.query);
  const [data, total] = await prisma.$transaction([
    prisma.socialPost.findMany({ include, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.socialPost.count(),
  ]);
  res.json({ data, pagination: { ...query, total, totalPages: Math.ceil(total / query.limit) } });
}));
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const post = await prisma.socialPost.findUnique({ where: { id: id.parse(req.params.id) }, include });
  if (!post) throw AppError.notFound('Rascunho não encontrado.');
  res.json(post);
}));
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const input = createSchema.parse(req.body);
  const post = await prisma.socialPost.create({ data: { title: input.title, variants: { create: input.variants } }, include });
  res.status(201).json(post);
}));
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const postId = id.parse(req.params.id);
  const input = updateSchema.parse(req.body);
  const post = await prisma.$transaction(async tx => {
    // A versão impede que uma edição sobrescreva uma revisão concorrente.
    const result = await tx.socialPost.updateMany({ where: { id: postId, version: input.version }, data: { title: input.title, approvedAt: null, version: { increment: 1 } } });
    if (!result.count) {
      if (!await tx.socialPost.findUnique({ where: { id: postId }, select: { id: true } })) throw AppError.notFound('Rascunho não encontrado.');
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
    const current = await tx.socialPost.findUnique({ where: { id: postId }, include });
    if (!current) throw AppError.notFound('Rascunho não encontrado.');
    if (current.version !== input.version) throw AppError.conflict('Este rascunho foi alterado. Atualize a página e revise novamente.');
    if (!current.variants.length || current.variants.some(item => !item.caption.trim())) throw AppError.badRequest('Preencha as legendas de todas as redes antes de aprovar.');
    const updated = await tx.socialPost.updateMany({ where: { id: postId, version: input.version }, data: { approvedAt: new Date(), version: { increment: 1 } } });
    if (!updated.count) throw AppError.conflict('Este rascunho foi alterado. Atualize a página e revise novamente.');
    return tx.socialPost.findUniqueOrThrow({ where: { id: postId }, include });
  });
  res.json(post);
}));
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const postId = id.parse(req.params.id);
  const input = revisionSchema.parse(req.body);
  const result = await prisma.socialPost.deleteMany({ where: { id: postId, version: input.version } });
  if (!result.count) {
    if (!await prisma.socialPost.findUnique({ where: { id: postId }, select: { id: true } })) throw AppError.notFound('Rascunho não encontrado.');
    throw AppError.conflict('Este rascunho foi alterado. Atualize a página antes de excluir.');
  }
  res.status(204).end();
}));
export default router;
