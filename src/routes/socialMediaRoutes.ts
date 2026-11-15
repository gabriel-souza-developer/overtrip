import { Router, raw, type Request, type Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, realpath, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { authenticate, authorize, type AuthRequest } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { assertImageUpload, MEDIA_MAX_BYTES, MediaUploadError } from '../services/mediaUpload.js';
import { processImage } from '../services/mediaProcessing.js';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(authenticate, authorize('admin'));
const inside = (child: string, parent: string) => child === parent || child.startsWith(parent + path.sep);
async function directory(): Promise<string> {
  const configured = process.env.SOCIAL_MEDIA_DIR || (process.env.NODE_ENV === 'production' ? '/var/lib/overtrip/social-media' : path.join(homedir(), '.local/share/overtrip-dev/social-media'));
  if (!path.isAbsolute(configured)) throw new AppError(503, 'Armazenamento privado indisponível.');
  const requested = path.resolve(configured);
  const prohibited = ['/', '/tmp', '/var', '/var/lib', '/var/lib/overtrip', '/srv', '/srv/overtrip', '/srv/overtrip-public', '/var/lib/overtrip/uploads', path.resolve(tmpdir()), path.resolve(homedir())];
  if (prohibited.includes(requested)) throw new AppError(503, 'Armazenamento privado deve ser um diretório dedicado.');
  await mkdir(configured, { recursive: true, mode: 0o700 });
  const info = await lstat(configured);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o7777) !== 0o700 || (typeof process.getuid === 'function' && info.uid !== process.getuid())) {
    throw new AppError(503, 'Diretório privado deve pertencer ao serviço e ter permissão 700.');
  }
  const dir = await realpath(configured);
  if (prohibited.includes(dir)) throw new AppError(503, 'Armazenamento privado deve ser um diretório dedicado.');
  const repo = await realpath(process.cwd());
  const publicRoot = '/srv/overtrip-public';
  const uploadDir = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : '/var/lib/overtrip/uploads';
  if (inside(dir, repo) || inside(repo, dir) || inside(dir, publicRoot) || inside(publicRoot, dir) || inside(dir, uploadDir) || inside(uploadDir, dir)) throw new AppError(503, 'Armazenamento privado inválido.');
  return dir;
}
function filename(key: string): string {
  if (!/^[a-f0-9]{32}\.(jpg|png)$/.test(key)) throw new AppError(500, 'Arquivo de mídia inválido.');
  return key;
}
/** Verifica o conteúdo imutável antes de aprovar a versão. */
export async function assertSocialMediaAvailable(storageKey: string, sha256: string): Promise<void> {
  try {
    const bytes = await readFile(path.join(await directory(), filename(storageKey)));
    if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('hash');
  } catch { throw AppError.badRequest('Imagem indisponível ou alterada. Envie a imagem novamente.'); }
}
router.post('/', createRateLimiter({ windowMs: 60000, max: 20 }), raw({ type: () => true, limit: MEDIA_MAX_BYTES, inflate: false }), asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const { body } = assertImageUpload(req.get('Content-Type'), req.body);
    const processed = await processImage(body);
    const dir = await directory();
    const key = `${randomBytes(16).toString('hex')}.${processed.ext}`;
    const full = path.join(dir, filename(key));
    await writeFile(full, processed.main, { flag: 'wx', mode: 0o600 });
    try {
      const asset = await prisma.socialMedia.create({ data: { storageKey: key, sha256: createHash('sha256').update(processed.main).digest('hex'), mimeType: processed.mimeType, width: processed.width, height: processed.height, sizeBytes: processed.main.length, createdById: req.user!.id }, select: { id: true, sha256: true, mimeType: true, width: true, height: true, sizeBytes: true, createdAt: true } });
      res.status(201).json(asset);
    } catch (error) { await unlink(full).catch(() => {}); throw error; }
  } catch (error) {
    if (error instanceof MediaUploadError) throw new AppError(error.status, error.message);
    throw error;
  }
}));
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const asset = await prisma.socialMedia.findUnique({ where: { id: req.params.id }, select: { storageKey: true, mimeType: true } });
  if (!asset) throw AppError.notFound('Imagem não encontrada.');
  let bytes: Buffer;
  try { bytes = await readFile(path.join(await directory(), filename(asset.storageKey))); }
  catch { throw AppError.notFound('Imagem não encontrada.'); }
  res.type(asset.mimeType).set('X-Content-Type-Options', 'nosniff').send(bytes);
}));
export default router;
