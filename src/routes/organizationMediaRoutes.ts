import { extname as pathExtension } from 'node:path';
import { Router, raw, type Response } from 'express';
import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { assertOrganizationWriteAccess, requireOrganizationMembership, type OrganizationRequest } from '../middleware/organizationContext.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { MEDIA_MAX_BYTES, MediaUploadError } from '../services/mediaUpload.js';
import { MEDIA_VARIANT_WIDTHS } from '../services/mediaProcessing.js';
import { assertTripUpload, processTripUpload } from '../services/tripMediaUpload.js';
import { describeExpectedFiles, mediaDirectory, mediaFilePath, mediaFilenames, mediaPublicSrc, MediaWriteCleanupError, removeMediaFiles, reserveStorageKey, writeImageFiles } from '../services/mediaStorage.js';
import { serveOwnedMediaFile } from '../services/organizationOwnedMedia.js';

// Montada em /:organizationId/tourism/media. Cada imagem enviada aqui é
// gravada com ESTA organizationId — nunca o escopo legado usado por
// /api/media — então só pode ser referenciada depois pelos destinos e pela
// galeria da própria empresa (ver organizationOwnedMedia.ts). Só
// OWNER/ADMIN enviam; qualquer membro ativo pode ver a própria mídia já
// enviada (rota de leitura abaixo).
const router = Router({ mergeParams: true });

export const mediaAssetSelect = { id: true, path: true, mimeType: true, width: true, height: true, sizeBytes: true, storageKey: true, createdAt: true } as const;
export type MediaAssetRow = { id: string; path: string; mimeType: string; width: number; height: number; sizeBytes: number; storageKey: string; createdAt: Date };
const select = mediaAssetSelect;
type AssetRow = MediaAssetRow;
// `src` fica no formato canônico (/api/public/media/...) gravado depois em
// Visit/GalleryEntry.images — é o que o formulário deve reenviar ao salvar.
// `previewSrc` aponta para a rota de leitura desta própria rota (acima, com
// req.organizationContext): funciona mesmo que a empresa não esteja em
// PUBLIC_SITE_ORGANIZATION_IDS, para o painel poder mostrar a foto antes de
// ela aparecer (ou não) em qualquer vitrine pública.
// Exportado: a importação de fotos extraídas de PDF (ver
// organizationTripDocumentRoutes.ts) grava pelo mesmo caminho pendente ->
// grava -> publica e devolve no mesmo formato, para o painel reaproveitar a
// mesma tela/componente de mídia já usado pelo envio comum.
export const presentMediaAsset = (organizationId: string, { storageKey, ...asset }: AssetRow) => ({
  ...asset,
  src: asset.path,
  previewSrc: `/api/organizations/${encodeURIComponent(organizationId)}/tourism/media/${storageKey}${pathExtension(asset.path)}`,
  variants: asset.mimeType === 'video/mp4' ? [] : MEDIA_VARIANT_WIDTHS.map((width) => ({ width, src: mediaPublicSrc(`${storageKey}-w${width}.webp`) })),
});
const asHttpError = (error: unknown) => (error instanceof MediaUploadError ? new AppError(error.status, error.message) : error);

router.get('/:file', requireOrganizationMembership(), asyncHandler(async (req: OrganizationRequest, res: Response) => {
  await serveOwnedMediaFile(res, prisma, req.organizationContext!.organization.id, req.params.file);
}));

router.post('/', requireOrganizationMembership('OWNER', 'ADMIN'),
  createRateLimiter({ windowMs: 60000, max: 20, message: 'Muitos envios em sequência. Aguarde um minuto.' }),
  raw({ type: () => true, limit: MEDIA_MAX_BYTES, inflate: false }),
  asyncHandler(async (req: OrganizationRequest, res: Response) => {
    const organizationId = req.organizationContext!.organization.id;
    let upload: ReturnType<typeof assertTripUpload>;
    try { upload = assertTripUpload(req.get('Content-Type'), req.body); }
    catch (error) { throw asHttpError(error); }
    const { body } = upload;
    const sha256 = createHash('sha256').update(body).digest('hex');

    // Mesmo arquivo enviado de novo: reaproveita, mas só dentro do escopo
    // desta empresa — nunca reaproveita (nem revela a existência de) um
    // arquivo idêntico de outra organização ou do acervo legado.
    const existing = await prisma.mediaAsset.findFirst({ where: { sha256, originalBytes: body.length, publishedAt: { not: null }, organizationId }, select });
    if (existing) {
      const directory = await mediaDirectory();
      const ext = existing.mimeType === 'video/mp4' ? 'mp4' : existing.mimeType === 'image/png' ? 'png' : 'jpg';
      const files = mediaFilenames(existing.storageKey, ext, ext === 'mp4' ? [] : MEDIA_VARIANT_WIDTHS);
      const complete = await Promise.all(files.map((f) => access(mediaFilePath(directory, f)).then(() => true, () => false)));
      if (complete.every(Boolean)) { res.status(200).json(presentMediaAsset(organizationId, existing)); return; }
    }

    let processed;
    try { processed = await processTripUpload(upload); }
    catch (error) { throw asHttpError(error); }

    // Mesma sequência pendente -> grava -> publica usada em mediaRoutes.ts
    // (rota legada): o registro existe antes de qualquer arquivo em disco,
    // nunca ao contrário.
    const storageKey = reserveStorageKey();
    const ext = processed.ext;
    const fileIntegrity = JSON.stringify(describeExpectedFiles(processed, storageKey));
    const pending = await prisma.mediaAsset.create({ data: {
      storageKey, path: mediaPublicSrc(`${storageKey}.${ext}`), mimeType: processed.mimeType,
      width: processed.width, height: processed.height, sizeBytes: processed.main.length,
      originalBytes: body.length, sha256, createdById: req.user!.id,
      organizationId,
      publishedAt: null, fileIntegrity,
    }, select: { id: true } });

    let stored: { directory: string; filenames: string[] } | undefined;
    try {
      stored = await writeImageFiles(processed, storageKey);
      // Reconfere vínculo e papel DENTRO da transação que publica: o envio
      // de um arquivo demora (processamento de imagem + gravação em disco),
      // tempo em que o vínculo pode ter sido revogado ou a empresa
      // desativada. Sem isto, só o middleware (antes de todo esse trabalho)
      // teria checado — nunca o suficiente para revogação no meio do envio.
      // Se falhar, a transação não publica nada e o catch abaixo limpa o
      // registro pendente e os arquivos já escritos.
      const asset = await prisma.$transaction(async (tx) => {
        await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
        return tx.mediaAsset.update({ where: { id: pending.id }, data: { publishedAt: new Date() }, select });
      });
      res.status(201).json(presentMediaAsset(organizationId, asset));
    } catch (error) {
      if (!(error instanceof MediaWriteCleanupError)) {
        try {
          const current = await prisma.mediaAsset.findUnique({ where: { id: pending.id }, select: { publishedAt: true } });
          if (current && current.publishedAt === null) {
            if (stored) await removeMediaFiles(stored.directory, stored.filenames);
            await prisma.mediaAsset.deleteMany({ where: { id: pending.id, publishedAt: null } });
          }
        } catch { /* limpeza de arquivo falhou: preserva o registro pendente de propósito */ }
      }
      throw error;
    }
  }));

export default router;
