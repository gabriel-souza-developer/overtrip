import { Router, raw, type Response } from 'express';
import sharp from 'sharp';
import { prisma } from '../lib/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { assertImageUpload, MediaUploadError } from '../services/mediaUpload.js';

const router = Router();
const limit = 5 * 1024 * 1024;
router.use(authenticate);
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.set('X-Content-Type-Options', 'nosniff'); next(); });

router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const avatar = await prisma.userAvatar.findUnique({ where: { userId: req.user!.id }, select: { data: true } });
  if (!avatar) { res.status(404).end(); return; }
  res.type('image/jpeg').send(Buffer.from(avatar.data));
}));

router.put('/', createRateLimiter({ windowMs: 60000, max: 10, keyOf: req => (req as AuthRequest).user!.id }), raw({ type: () => true, limit, inflate: false }), asyncHandler(async (req: AuthRequest, res: Response) => {
  let body: Buffer;
  try { body = assertImageUpload(req.get('content-type'), req.body, limit).body; }
  catch (error) { if (error instanceof MediaUploadError) throw new AppError(error.status, error.message); throw error; }
  let data: Buffer;
  try {
    data = await sharp(body, { limitInputPixels: 16_000_000, failOn: 'error', animated: false }).rotate().resize(256, 256, { fit: 'cover' }).flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).toBuffer();
  } catch { throw new AppError(400, 'Não foi possível ler esta imagem.'); }
  await prisma.userAvatar.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, data }, update: { data } });
  res.status(204).end();
}));

router.delete('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  await prisma.userAvatar.deleteMany({ where: { userId: req.user!.id } });
  res.status(204).end();
}));
export default router;
