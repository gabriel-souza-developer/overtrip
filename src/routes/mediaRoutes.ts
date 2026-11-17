import { Router, raw, Response } from 'express';
import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import { prisma } from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { assertImageUpload, MEDIA_MAX_BYTES, MediaUploadError } from '../services/mediaUpload.js';
import { MEDIA_VARIANT_WIDTHS, processImage } from '../services/mediaProcessing.js';
import { describeExpectedFiles, mediaDirectory, mediaFilePath, mediaFilenames, mediaPublicSrc, MediaWriteCleanupError, removeMediaFiles, reserveStorageKey, writeImageFiles } from '../services/mediaStorage.js';
import { currentLegacyMediaFilter, legacyTourismOrganizationIdForNewRecord } from '../services/legacyTourismScope.js';

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
    // Só dentro do próprio escopo — nunca reaproveita (nem revela a
    // existência de) um arquivo idêntico de outra empresa. Só considera um
    // registro já publicado: um pendente pode não ter arquivo nenhum ainda.
    const existing = await prisma.mediaAsset.findFirst({ where: { sha256, originalBytes: body.length, publishedAt: { not: null }, ...currentLegacyMediaFilter() }, select });
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

    // Registro criado ANTES de gravar qualquer arquivo, como pendente
    // (publishedAt null): se o processo cair entre aqui e a publicação, o
    // pior resultado possível é uma linha pendente (nunca servida pela rota
    // pública) com talvez algum arquivo em disco — nunca um arquivo sem
    // registro nenhum. scripts/reconcile-pending-media.ts resolve o que
    // ficar pendente por tempo demais.
    const storageKey = reserveStorageKey();
    const ext = processed.mimeType === 'image/png' ? 'png' : 'jpg';
    // Tamanho e hash de cada arquivo esperado, calculados agora (buffers já
    // em memória) e gravados ANTES de escrever qualquer arquivo: é o que
    // reconcilePendingMedia usa depois para provar que um arquivo em disco é
    // exatamente o que devia ter sido gravado, não só que existe um arquivo
    // com aquele nome (pode estar truncado por uma queda no meio da escrita).
    const fileIntegrity = JSON.stringify(describeExpectedFiles(processed, storageKey));
    const pending = await prisma.mediaAsset.create({ data: {
      storageKey, path: mediaPublicSrc(`${storageKey}.${ext}`), mimeType: processed.mimeType,
      width: processed.width, height: processed.height, sizeBytes: processed.main.length,
      originalBytes: body.length, sha256, createdById: req.user!.id,
      organizationId: legacyTourismOrganizationIdForNewRecord(),
      publishedAt: null, fileIntegrity,
    }, select: { id: true } });

    let stored: { directory: string; filenames: string[] } | undefined;
    try {
      stored = await writeImageFiles(processed, storageKey);
      const asset = await prisma.mediaAsset.update({ where: { id: pending.id }, data: { publishedAt: new Date() }, select });
      res.status(201).json(present(asset));
    } catch (error) {
      if (!(error instanceof MediaWriteCleanupError)) {
        // writeImageFiles (se foi quem lançou) já limpou tudo que tinha
        // gravado com sucesso; se o erro veio de depois (a chamada que
        // publica falhou), limpamos aqui. NUNCA apaga arquivo nem registro
        // sem reconferir antes que o registro ainda esteja mesmo pendente:
        // a falha pode ter ocorrido depois de o próprio update já ter sido
        // efetivado no banco (ex.: erro de rede só na resposta), e se o
        // ativo já estiver publicado, apagá-lo agora destruiria um ativo
        // publicado de verdade. Só então apagamos o registro pendente DEPOIS
        // de confirmar que a limpeza de arquivo teve sucesso — nunca ao
        // contrário: apagar o registro antes (ou mesmo que) a limpeza falhe
        // perderia o único rastro de que esses arquivos existem.
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
