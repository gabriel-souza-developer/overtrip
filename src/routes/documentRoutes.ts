import { Router, raw, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { assertPdfUpload, DOCUMENT_MAX_BYTES, DOCUMENT_MAX_PER_TRIP, DocumentUploadError } from '../services/documentUpload.js';
import { documentDirectory, documentPath, removeDocumentFile, storeScannedPdf } from '../services/documentStorage.js';
import { envProvider } from './aiRoutes.js';
import { AiDraftError } from '../services/aiTripDraft.js';
import { generateDocumentSuggestions } from '../services/documentSuggestions.js';

const router = Router({ mergeParams: true });
router.use(authenticate, authorize('admin'));
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const metadata = { id: true, originalFilename: true, sizeBytes: true, scanStatus: true, extractionStatus: true, retentionUntil: true, createdAt: true } as const;

router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await prisma.tripDocument.findMany({
    where: { tripId: req.params.tripId, retentionUntil: { gt: new Date() }, deletedAt: null },
    select: metadata, orderBy: { createdAt: 'desc' },
  }));
}));

router.post('/', createRateLimiter({ windowMs: 60000, max: 5 }),
  raw({ type: () => true, limit: DOCUMENT_MAX_BYTES, inflate: false }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    let body: Buffer;
    try { body = assertPdfUpload(req.get('Content-Type'), req.body); }
    catch (error) {
      if (error instanceof DocumentUploadError) throw new AppError(error.status, error.message);
      throw error;
    }
    let filename: string | undefined;
    try { filename = decodeURIComponent(req.get('X-Document-Filename') ?? ''); }
    catch { throw AppError.badRequest('Nome de arquivo inválido'); }
    if (!filename || filename.length > 200 || /[\/\\\x00-\x1f\x7f]/.test(filename) || !/\.pdf$/i.test(filename)) {
      throw AppError.badRequest('Informe um nome de arquivo .pdf válido em X-Document-Filename');
    }
    if (!await prisma.trip.findUnique({ where: { id: req.params.tripId }, select: { id: true } })) throw AppError.notFound('Viagem não encontrada');
    const stored = await storeScannedPdf(body);
    try {
      const document = await prisma.$transaction(async tx => {
        const count = await tx.tripDocument.count({ where: { tripId: req.params.tripId, deletedAt: null, retentionUntil: { gt: new Date() } } });
        if (count >= DOCUMENT_MAX_PER_TRIP) throw AppError.conflict('Limite de cinco documentos por viagem atingido');
        return tx.tripDocument.create({ data: {
          tripId: req.params.tripId, originalFilename: filename, storageKey: stored.key,
          mimeType: 'application/pdf', sizeBytes: body.length,
          sha256: createHash('sha256').update(body).digest('hex'), createdById: req.user!.id,
          scanStatus: 'CLEAN', extractionStatus: 'PENDING',
          retentionUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }, select: metadata });
      });
      res.status(201).json(document);
    } catch (error) {
      await removeDocumentFile(stored.directory, stored.key);
      throw error;
    }
  }));

router.post('/:documentId/suggestions', createRateLimiter({ windowMs: 60000, max: 10 }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const document = await prisma.tripDocument.findFirst({ where: {
    id: req.params.documentId, tripId: req.params.tripId, scanStatus: 'CLEAN', extractionStatus: 'READY', deletedAt: null,
    retentionUntil: { gt: new Date() },
  }, select: { id: true, originalFilename: true, pages: { select: { pageNumber: true, text: true }, orderBy: { pageNumber: 'asc' } } } });
  if (!document) throw AppError.notFound('Documento não encontrado ou ainda não processado');
  if (process.env.DOCUMENT_AI_EXTERNAL_ENABLED !== 'true') throw new AppError(503, 'A análise de documentos por IA externa está desativada neste ambiente.');
  const provider = envProvider();
  if (!provider) throw new AppError(503, 'A ajuda de IA não está ativada neste ambiente.');
  try {
    const result = await generateDocumentSuggestions(provider, document, process.env.AI_MODEL || undefined);
    // A exclusão ou expiração durante a chamada invalida o resultado.
    const current = await prisma.tripDocument.findFirst({ where: { id: document.id, tripId: req.params.tripId, scanStatus: 'CLEAN', extractionStatus: 'READY', deletedAt: null, retentionUntil: { gt: new Date() } }, select: { id: true } });
    if (!current) throw AppError.notFound('Documento não encontrado ou expirado');
    res.json(result);
  } catch (error) {
    if (error instanceof AiDraftError) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }
}));

router.get('/:documentId', asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const document = await prisma.tripDocument.findFirst({ where: {
    id: req.params.documentId, tripId: req.params.tripId, scanStatus: 'CLEAN', deletedAt: null,
    retentionUntil: { gt: new Date() },
  } });
  if (!document) throw AppError.notFound('Documento não encontrado');
  res.set('X-Content-Type-Options', 'nosniff');
  res.download(documentPath(await documentDirectory(), document.storageKey), document.originalFilename, (error: Error | null) => { if (error) next(error); });
}));

router.delete('/:documentId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const document = await prisma.tripDocument.findFirst({ where: { id: req.params.documentId, tripId: req.params.tripId } });
  if (!document) throw AppError.notFound('Documento não encontrado');
  await removeDocumentFile(await documentDirectory(), document.storageKey);
  await prisma.tripDocument.deleteMany({ where: { id: document.id } });
  res.status(204).end();
}));
export default router;
