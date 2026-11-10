import { Router, raw, Response } from 'express';
import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import { prisma } from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { assertImageUpload, MEDIA_MAX_BYTES, MediaUploadError } from '../services/mediaUpload.js';
import { MEDIA_VARIANT_WIDTHS, processImage } from '../services/mediaProcessing.js';
import { mediaDirectory, mediaFilePath, mediaFilenames, mediaPublicSrc, removeMediaFiles, storeProcessedImage } from '../services/mediaStorage.js';

/** Perfis que já podem editar viagens e galeria no painel. */
export const MEDIA_UPLOAD_ROLES = ['admin', 'editor'] as const;

const router = Router();
router.use(authenticate, authorize(...MEDIA_UPLOAD_ROLES));
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const select = { id: true, path: true, mimeType: true, width: true, height: true, sizeBytes: true, storageKey: true, createdAt: true } as const;
type AssetRow = { id: string; path: string; mimeType: string; width: number; height: number; sizeBytes: number; storageKey: string; createdAt: Date };

const present = ({ storageKey, ...asset }: AssetRow) => ({
  ...asset,
  src: asset.path,
  variants: MEDIA_VARIANT_WIDTHS.map((width) => ({ width, src: mediaPublicSrc(`${storageKey}-w${width}.webp`) })),
});

const asHttpError = (error: unknown) => error instanceof MediaUploadError ? new AppError(error.status, error.message) : error;

router.post('/', createRateLimiter({ windowMs: 60000, max: 20, message: 'Muitos envios em sequência. Aguarde um minuto.' }),
  raw({ type: () => true, limit: MEDIA_MAX_BYTES, inflate: false }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    let body: Buffer;
    try { body = assertImageUpload(req.get('Content-Type'), req.body).body; }
    catch (error) { throw asHttpError(error); }
    const sha256 = createHash('sha256').update(body).digest('hex');

    // Mesmo arquivo enviado de novo: reaproveita, se os arquivos ainda existirem.
    const existing = await prisma.mediaAsset.findFirst({ where: { sha256, originalBytes: body.length }, select });
    if (existing) {
      const directory = await mediaDirectory();
      const ext = existing.mimeType === 'image/png' ? 'png' : 'jpg';
      const files = mediaFilenames(existing.storageKey, ext, MEDIA_VARIANT_WIDTHS);
      const complete = await Promise.all(files.map((f) => access(mediaFilePath(directory, f)).then(() => true, () => false)));
      if (complete.every(Boolean)) { res.status(200).json(present(existing)); return; }
    }

    let processed;
    try { processed = await processImage(body); }
    catch (error) { throw asHttpError(error); }
    const stored = await storeProcessedImage(processed);
    try {
      const asset = await prisma.mediaAsset.create({ data: {
        storageKey: stored.key, path: mediaPublicSrc(stored.filenames[0]), mimeType: processed.mimeType,
        width: processed.width, height: processed.height, sizeBytes: processed.main.length,
        originalBytes: body.length, sha256, createdById: req.user!.id,
      }, select });
      res.status(201).json(present(asset));
    } catch (error) {
      await removeMediaFiles(stored.directory, stored.filenames);
      throw error;
    }
  }));

export default router;
