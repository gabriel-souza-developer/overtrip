import { Router, raw, type Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { assertOrganizationWriteAccess, requireOrganizationMembership, type OrganizationRequest } from '../middleware/organizationContext.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { processImage } from '../services/mediaProcessing.js';
import { assertImageUpload, MEDIA_MAX_BYTES, MediaUploadError } from '../services/mediaUpload.js';
import { socialMediaDirectory, socialMediaFilename, SOCIAL_MEDIA_CONTENT_TYPES } from '../services/socialMediaStorage.js';

// Montada em /:organizationId/tourism/social-media. Mesmo diretório privado
// e mesmas validações de upload da rota legada (/api/social-media) —
// reaproveitados via services/socialMediaStorage.ts — mas toda leitura e
// escrita é filtrada por organizationId: uma empresa nunca lê, nem conta
// no total, a mídia de outra empresa ou do acervo legado (organizationId
// nulo). Mesma restrição de organizationSocialPostRoutes.ts: só OWNER/ADMIN
// leem ou enviam.
const router = Router({ mergeParams: true });
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const select = { id: true, sha256: true, mimeType: true, width: true, height: true, sizeBytes: true, createdAt: true } as const;

router.get('/:id', requireOrganizationMembership('OWNER', 'ADMIN'), asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const organizationId = req.organizationContext!.organization.id;
  const asset = await prisma.socialMedia.findFirst({ where: { id: req.params.id, organizationId }, select: { storageKey: true, mimeType: true } });
  if (!asset) throw AppError.notFound('Imagem não encontrada.');
  let bytes: Buffer;
  try { bytes = await readFile(path.join(await socialMediaDirectory(), socialMediaFilename(asset.storageKey))); }
  catch { throw AppError.notFound('Imagem não encontrada.'); }
  const ext = asset.storageKey.slice(asset.storageKey.lastIndexOf('.') + 1);
  res.type(SOCIAL_MEDIA_CONTENT_TYPES[ext] ?? asset.mimeType).set('X-Content-Type-Options', 'nosniff').send(bytes);
}));

router.post('/', requireOrganizationMembership('OWNER', 'ADMIN'),
  createRateLimiter({ windowMs: 60000, max: 20, message: 'Muitos envios em sequência. Aguarde um minuto.' }),
  raw({ type: () => true, limit: MEDIA_MAX_BYTES, inflate: false }),
  asyncHandler(async (req: OrganizationRequest, res: Response) => {
    const organizationId = req.organizationContext!.organization.id;
    let processed;
    try {
      const { body } = assertImageUpload(req.get('Content-Type'), req.body);
      processed = await processImage(body);
    } catch (error) {
      throw error instanceof MediaUploadError ? new AppError(error.status, error.message) : error;
    }
    const dir = await socialMediaDirectory();
    const key = `${randomBytes(16).toString('hex')}.${processed.ext}`;
    const full = path.join(dir, socialMediaFilename(key));
    await writeFile(full, processed.main, { flag: 'wx', mode: 0o600 });
    try {
      const asset = await prisma.$transaction(async (tx) => {
        // O processamento de imagem e a gravação em disco levam tempo; o
        // vínculo com a empresa pode ter sido revogado nesse intervalo,
        // então reconferimos dentro da própria transação que grava.
        await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
        return tx.socialMedia.create({
          data: {
            storageKey: key,
            sha256: createHash('sha256').update(processed.main).digest('hex'),
            mimeType: processed.mimeType,
            width: processed.width,
            height: processed.height,
            sizeBytes: processed.main.length,
            createdById: req.user!.id,
            organizationId,
          },
          select,
        });
      });
      res.status(201).json(asset);
    } catch (error) {
      await unlink(full).catch(() => {});
      throw error;
    }
  }));

export default router;
