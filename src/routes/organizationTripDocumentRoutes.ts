import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Router, raw, type Response, type NextFunction } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import {
  assertOrganizationWriteAccess,
  loadActiveOrganizationMembership,
  requireOrganizationMembership,
  ORGANIZATION_WRITE_ROLES,
  type OrganizationRequest,
} from '../middleware/organizationContext.js';
import { assertPdfUpload, DOCUMENT_MAX_BYTES, DOCUMENT_MAX_PER_TRIP, DocumentUploadError } from '../services/documentUpload.js';
import { documentDirectory, documentPath, removeDocumentFile, storeScannedPdf } from '../services/documentStorage.js';
import { envProvider } from './aiRoutes.js';
import { AiDraftError } from '../services/aiTripDraft.js';
import { generateDocumentSuggestions } from '../services/documentSuggestions.js';
import { extractEmbeddedImages, processPdfCandidateSandboxed, PdfImagesError } from '../services/pdfEmbeddedImages.js';
import { describeExpectedFiles, mediaPublicSrc, MediaWriteCleanupError, removeMediaFiles, reserveStorageKey, writeImageFiles } from '../services/mediaStorage.js';
import { mediaAssetSelect, presentMediaAsset } from './organizationMediaRoutes.js';

// PDFs do roteiro, agora por empresa. Reaproveita a varredura antivírus
// (síncrona e fail-closed em storeScannedPdf/scanPdf), a extração (worker
// compartilhado, ver documentWorker.ts) e a geração de sugestões por IA
// (generateDocumentSuggestions) já usadas pelo operador legado — só a
// camada de autorização e titularidade é própria desta rota.
//
// Isolamento: toda viagem aqui é buscada por {id: tripId, organizationId},
// nunca só por tripId. Uma viagem legada (organizationId nulo ou da empresa
// legada configurada) ou de outra empresa nunca combina com este filtro, e
// cai em 404 — nunca revela nem é alcançada por esta rota. OWNER/ADMIN é
// exigido em toda operação (leitura incluída): documentos privados de uma
// viagem não são um dado que um MEMBER comum deva ver ou mexer.
//
// NÃO é isolamento absoluto do dado em si, só desta rota: se
// LEGACY_TOURISM_ORGANIZATION_ID apontar para ESTA empresa, o operador
// legado (rota própria, ver documentRoutes.ts/legacyTripScope.ts) continua
// vendo e baixando os mesmos PDFs desta viagem — compartilhamento
// deliberado e documentado (ver legacyTourismScope.ts), nunca um acidente
// desta rota, e nunca estendido a outra empresa. Quem lê só este arquivo
// não deve concluir que uma viagem "só aparece no painel da própria
// empresa": essa garantia vale só para o painel; o operador legado tem um
// caminho próprio e intencional quando configurado assim.
const router = Router({ mergeParams: true });
router.use(requireOrganizationMembership('OWNER', 'ADMIN'));
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// Confirma a cada requisição que :tripId é desta empresa (nunca legado, nunca
// de outra empresa) antes de qualquer leitura ou escrita. Mesma limitação
// conhecida do equivalente legado (requireLegacyTripScope): roda fora de
// qualquer transação com o handler seguinte — para POST/DELETE, o handler
// reconfere viagem e papel DENTRO da própria transação da escrita (ver
// assertOrganizationWriteAccess abaixo), fechando a janela para mutações;
// para GET, esta checagem por requisição já é a mesma garantia usada pelas
// demais rotas de leitura do painel de empresa.
const requireOrgTripScope = asyncHandler(async (req: OrganizationRequest, _res: Response, next: NextFunction) => {
  const organizationId = req.organizationContext!.organization.id;
  const tripId = req.params.tripId;
  const trip = await prisma.trip.findFirst({ where: { id: tripId, organizationId }, select: { id: true } });
  if (!trip) throw AppError.notFound('Viagem não encontrada');
  next();
});
router.use(requireOrgTripScope);

const metadata = { id: true, originalFilename: true, sizeBytes: true, scanStatus: true, extractionStatus: true, retentionUntil: true, createdAt: true } as const;

router.get('/', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const tripId = req.params.tripId;
  // tripId já confirmado desta empresa por requireOrgTripScope: filtrar só
  // por tripId aqui é seguro (um documento nunca aponta para a viagem de
  // outra empresa — ver tripId @unique por documento na própria FK).
  res.json(await prisma.tripDocument.findMany({
    where: { tripId, retentionUntil: { gt: new Date() }, deletedAt: null },
    select: metadata, orderBy: { createdAt: 'desc' },
  }));
}));

router.post('/', createRateLimiter({ windowMs: 60000, max: 5 }),
  raw({ type: () => true, limit: DOCUMENT_MAX_BYTES, inflate: false }),
  asyncHandler(async (req: OrganizationRequest, res: Response) => {
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
    const organizationId = req.organizationContext!.organization.id;
    const tripId = req.params.tripId;
    // Varredura antivírus síncrona e fail-closed: se o scanner estiver
    // indisponível ou recusar o arquivo, nada chega a ser gravado no banco
    // (ver scanPdf/storeScannedPdf em documentStorage.ts).
    const stored = await storeScannedPdf(body);
    try {
      const document = await prisma.$transaction(async tx => {
        await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
        const trip = await tx.trip.findFirst({ where: { id: tripId, organizationId }, select: { id: true } });
        if (!trip) throw AppError.notFound('Viagem não encontrada');
        const count = await tx.tripDocument.count({ where: { tripId, deletedAt: null, retentionUntil: { gt: new Date() } } });
        if (count >= DOCUMENT_MAX_PER_TRIP) throw AppError.conflict('Limite de cinco documentos por viagem atingido');
        return tx.tripDocument.create({ data: {
          tripId, originalFilename: filename, storageKey: stored.key,
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

router.post('/:documentId/suggestions', createRateLimiter({ windowMs: 60000, max: 10 }), asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const organizationId = req.organizationContext!.organization.id;
  const tripId = req.params.tripId;
  const documentId = req.params.documentId;
  const userId = req.user!.id;

  const loadValidDocument = () => prisma.tripDocument.findFirst({
    where: { id: documentId, tripId, scanStatus: 'CLEAN', extractionStatus: 'READY', deletedAt: null, retentionUntil: { gt: new Date() } },
    select: { id: true, originalFilename: true, pages: { select: { pageNumber: true, text: true }, orderBy: { pageNumber: 'asc' } } },
  });
  const assertStillAllowed = async () => {
    const fresh = await loadActiveOrganizationMembership(prisma, organizationId, userId);
    if (!fresh || !ORGANIZATION_WRITE_ROLES.includes(fresh.membership.role)) throw AppError.forbidden('Sem permissão para esta operação nesta empresa');
    const trip = await prisma.trip.findFirst({ where: { id: tripId, organizationId }, select: { id: true } });
    if (!trip) throw AppError.notFound('Viagem não encontrada');
  };

  // Revalida vínculo ativo, papel e titularidade da viagem ANTES de enviar
  // qualquer texto do documento a um provedor externo de IA — nunca confia
  // só na checagem que o middleware já fez antes de abrir esta requisição.
  await assertStillAllowed();
  const document = await loadValidDocument();
  if (!document) throw AppError.notFound('Documento não encontrado ou ainda não processado');

  if (process.env.DOCUMENT_AI_EXTERNAL_ENABLED !== 'true') throw new AppError(503, 'A análise de documentos por IA externa está desativada neste ambiente.');
  const provider = envProvider();
  if (!provider) throw new AppError(503, 'A ajuda de IA não está ativada neste ambiente.');

  let result;
  try {
    result = await generateDocumentSuggestions(provider, document, process.env.AI_MODEL || undefined);
  } catch (error) {
    if (error instanceof AiDraftError) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }

  // A chamada acima pode ter demorado: revalida tudo de novo (vínculo,
  // papel, viagem e o próprio documento — pode ter expirado ou sido
  // excluído nesse intervalo) antes de devolver o resultado ao cliente.
  await assertStillAllowed();
  const current = await loadValidDocument();
  if (!current) throw AppError.notFound('Documento não encontrado ou expirado');

  res.json(result);
}));

// Fotos embutidas no PDF: ver src/services/pdfEmbeddedImages.ts. Desativado
// por padrão em todo ambiente (mesmo padrão de DOCUMENT_AI_EXTERNAL_ENABLED
// acima) — precisa de DOCUMENT_PDF_IMAGE_EXTRACTION_ENABLED=true E de
// DOCUMENT_PDFIMAGES_PATH configurado para sequer tentar. extractEmbeddedImages
// já falha fechado (SANDBOX_UNAVAILABLE) se bwrap/prlimit não isolarem de
// verdade neste host — aqui só traduzimos esse resultado para HTTP.
function pdfImagesParserPath(): string | null {
  const parser = process.env.DOCUMENT_PDFIMAGES_PATH;
  return parser && path.isAbsolute(parser) ? parser : null;
}
function assertPdfImageExtractionEnabled(): string {
  const parser = pdfImagesParserPath();
  if (process.env.DOCUMENT_PDF_IMAGE_EXTRACTION_ENABLED !== 'true' || !parser) {
    throw new AppError(503, 'A extração de fotos do PDF está desativada neste ambiente.');
  }
  return parser;
}
function pdfImagesHttpError(error: PdfImagesError): AppError {
  switch (error.code) {
    case 'CONCURRENCY_LIMIT': return new AppError(429, 'Muitas extrações de fotos em andamento. Tente novamente em alguns segundos.');
    case 'SANDBOX_UNAVAILABLE':
    case 'MEMORY_ISOLATION_UNAVAILABLE':
    case 'PARSER_UNAVAILABLE': return new AppError(503, 'A extração de fotos do PDF está indisponível neste ambiente.');
    default: return new AppError(422, 'Não foi possível extrair fotos deste PDF.');
  }
}

// Nunca persiste nada: devolve candidatas privadas (nunca publicadas, nunca
// gravadas) para a pessoa escolher à mão (ver POST .../images/:index/import,
// a única rota que grava algo). Revalida vínculo, papel, viagem e o próprio
// documento tanto ANTES de ler/processar o PDF quanto DEPOIS da extração
// (que pode demorar) e antes de devolver qualquer candidata — igual a
// /suggestions: a checagem de antes de abrir a extração nunca é suficiente
// por si só, porque o vínculo pode ser revogado, a viagem removida, ou o
// documento excluído/expirado durante o processamento.
router.post('/:documentId/images', createRateLimiter({ windowMs: 60000, max: 10 }), asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const organizationId = req.organizationContext!.organization.id;
  const tripId = req.params.tripId;
  const documentId = req.params.documentId;
  const userId = req.user!.id;
  const parserPath = assertPdfImageExtractionEnabled();

  const loadValidDocument = (client: PrismaClient | Prisma.TransactionClient = prisma) => client.tripDocument.findFirst({
    where: { id: documentId, tripId, scanStatus: 'CLEAN', deletedAt: null, retentionUntil: { gt: new Date() } },
    select: { id: true, storageKey: true },
  });
  const assertStillAllowed = async (client: PrismaClient | Prisma.TransactionClient = prisma) => {
    const fresh = await loadActiveOrganizationMembership(client, organizationId, userId);
    if (!fresh || !ORGANIZATION_WRITE_ROLES.includes(fresh.membership.role)) throw AppError.forbidden('Sem permissão para esta operação nesta empresa');
    const trip = await client.trip.findFirst({ where: { id: tripId, organizationId }, select: { id: true } });
    if (!trip) throw AppError.notFound('Viagem não encontrada');
  };

  await assertStillAllowed();
  const document = await loadValidDocument();
  if (!document) throw AppError.notFound('Documento não encontrado');

  const pdfBytes = await readFile(documentPath(await documentDirectory(), document.storageKey));
  let candidates;
  try { candidates = await extractEmbeddedImages(pdfBytes, parserPath); }
  catch (error) { throw error instanceof PdfImagesError ? pdfImagesHttpError(error) : error; }

  // A extração acima pode ter demorado: revalida tudo de novo antes de
  // devolver qualquer imagem privada ao cliente.
  await assertStillAllowed();
  const current = await loadValidDocument();
  if (!current) throw AppError.notFound('Documento não encontrado ou expirado');

  res.json({ images: candidates.map((candidate, index) => ({
    index, page: candidate.page, width: candidate.width, height: candidate.height,
    // Prévia só nesta resposta, nunca em disco: quem decide o que persistir
    // (e onde) é o import abaixo, não a extração.
    dataUrl: `data:${candidate.mimeType};base64,${candidate.data.toString('base64')}`,
  })) });
}));

// Importa UMA foto já revisada por uma pessoa (seleção humana, nunca
// automática) para a mídia da própria empresa — mesmo registro
// pendente -> grava -> publica -> limpeza do envio comum (ver
// organizationMediaRoutes.ts), só que a origem é um candidato extraído, não
// um upload HTTP direto. Reextrai em vez de reaproveitar um resultado
// anterior guardado em memória: mais simples e sem estado de sessão para
// expirar ou vazar entre empresas; o custo é extrair de novo por foto
// importada, aceitável dado o limite de concorrência do próprio módulo.
router.post('/:documentId/images/:index/import', createRateLimiter({ windowMs: 60000, max: 20 }), asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const organizationId = req.organizationContext!.organization.id;
  const tripId = req.params.tripId;
  const documentId = req.params.documentId;
  const userId = req.user!.id;
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0) throw AppError.badRequest('Índice inválido');
  const parserPath = assertPdfImageExtractionEnabled();

  const loadValidDocument = (client: PrismaClient | Prisma.TransactionClient = prisma) => client.tripDocument.findFirst({
    where: { id: documentId, tripId, scanStatus: 'CLEAN', deletedAt: null, retentionUntil: { gt: new Date() } },
    select: { id: true, storageKey: true },
  });
  const assertStillAllowed = async (client: PrismaClient | Prisma.TransactionClient = prisma) => {
    const fresh = await loadActiveOrganizationMembership(client, organizationId, userId);
    if (!fresh || !ORGANIZATION_WRITE_ROLES.includes(fresh.membership.role)) throw AppError.forbidden('Sem permissão para esta operação nesta empresa');
    const trip = await client.trip.findFirst({ where: { id: tripId, organizationId }, select: { id: true } });
    if (!trip) throw AppError.notFound('Viagem não encontrada');
  };
  await assertStillAllowed();
  const document = await loadValidDocument();
  if (!document) throw AppError.notFound('Documento não encontrado');

  const pdfBytes = await readFile(documentPath(await documentDirectory(), document.storageKey));
  let candidates;
  try { candidates = await extractEmbeddedImages(pdfBytes, parserPath); }
  catch (error) { throw error instanceof PdfImagesError ? pdfImagesHttpError(error) : error; }
  const candidate = candidates[index];
  if (!candidate) throw AppError.notFound('Foto não encontrada nesta extração');

  // A extração acima pode ter demorado: revalida vínculo, papel, viagem E o
  // próprio documento (pode ter sido revogado, excluído ou expirado nesse
  // intervalo) antes de processar ou gravar qualquer coisa.
  await assertStillAllowed();
  const stillValidDocument = await loadValidDocument();
  if (!stillValidDocument) throw AppError.notFound('Documento não encontrado ou expirado');

  let processed;
  try { processed = await processPdfCandidateSandboxed(candidate); }
  catch (error) { throw error instanceof PdfImagesError ? pdfImagesHttpError(error) : error; }

  const sha256 = createHash('sha256').update(candidate.data).digest('hex');
  const storageKey = reserveStorageKey();
  const ext = processed.mimeType === 'image/png' ? 'png' : 'jpg';
  const fileIntegrity = JSON.stringify(describeExpectedFiles(processed, storageKey));
  const pending = await prisma.mediaAsset.create({ data: {
    storageKey, path: mediaPublicSrc(`${storageKey}.${ext}`), mimeType: processed.mimeType,
    width: processed.width, height: processed.height, sizeBytes: processed.main.length,
    originalBytes: candidate.data.length, sha256, createdById: userId,
    organizationId, publishedAt: null, fileIntegrity,
  }, select: { id: true } });

  let stored: { directory: string; filenames: string[] } | undefined;
  try {
    stored = await writeImageFiles(processed, storageKey);
    // Reconfere vínculo, papel, viagem E o documento de origem DENTRO da
    // transação que publica — mesmo motivo do upload comum, mais o
    // documento: o processamento acima demora, e uma revogação, exclusão
    // da viagem OU exclusão/expiração do próprio documento nesse intervalo
    // nunca deve conseguir publicar uma foto extraída dele.
    const asset = await prisma.$transaction(async (tx) => {
      await assertOrganizationWriteAccess(tx, organizationId, userId);
      const trip = await tx.trip.findFirst({ where: { id: tripId, organizationId }, select: { id: true } });
      if (!trip) throw AppError.notFound('Viagem não encontrada');
      const finalDocument = await loadValidDocument(tx);
      if (!finalDocument) throw AppError.notFound('Documento não encontrado ou expirado');
      return tx.mediaAsset.update({ where: { id: pending.id }, data: { publishedAt: new Date() }, select: mediaAssetSelect });
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
      } catch { /* limpeza de arquivo falhou: preserva o registro pendente de propósito, igual ao envio comum */ }
    }
    throw error;
  }
}));

router.get('/:documentId', asyncHandler(async (req: OrganizationRequest, res: Response, next: NextFunction) => {
  const tripId = req.params.tripId;
  const document = await prisma.tripDocument.findFirst({ where: {
    id: req.params.documentId, tripId, scanStatus: 'CLEAN', deletedAt: null,
    retentionUntil: { gt: new Date() },
  } });
  if (!document) throw AppError.notFound('Documento não encontrado');
  res.set('X-Content-Type-Options', 'nosniff');
  res.download(documentPath(await documentDirectory(), document.storageKey), document.originalFilename, (error: Error | null) => { if (error) next(error); });
}));

router.delete('/:documentId', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const organizationId = req.organizationContext!.organization.id;
  const tripId = req.params.tripId;
  const documentId = req.params.documentId;
  // Permissão, titularidade (empresa + viagem + documento) e a própria
  // remoção do metadado ficam na MESMA transação: uma revogação entre a
  // checagem e a exclusão nunca mais consegue "passar" (não há uma segunda
  // chamada fora da transação que confiaria numa permissão já obsoleta).
  // A partir daqui o documento já não existe para nenhuma leitura, mesmo
  // que a remoção física abaixo falhe.
  const document = await prisma.$transaction(async tx => {
    await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
    const trip = await tx.trip.findFirst({ where: { id: tripId, organizationId }, select: { id: true } });
    if (!trip) throw AppError.notFound('Viagem não encontrada');
    const doc = await tx.tripDocument.findFirst({ where: { id: documentId, tripId, deletedAt: null }, select: { id: true, storageKey: true } });
    if (!doc) throw AppError.notFound('Documento não encontrado');
    await tx.tripDocument.delete({ where: { id: doc.id } });
    return doc;
  });
  // Melhor esforço: o metadado já está excluído de forma consistente: se a
  // remoção física falhar aqui — disco indisponível, processo encerrado, OU
  // o próprio documentDirectory() recusar (ver AppError que ele lança) —, o
  // arquivo fica órfão no storage em vez de metadado órfão no banco — a
  // limpeza periódica (purgeExpiredDocuments, ver documentRetention.ts) já
  // remove qualquer .pdf sem TripDocument correspondente. try/catch (não só
  // .catch() encadeado) porque documentDirectory() também pode rejeitar
  // antes de removeDocumentFile ser chamada.
  try {
    await removeDocumentFile(await documentDirectory(), document.storageKey);
  } catch {
    console.error('Falha ao remover arquivo privado após exclusão do documento');
  }
  res.status(204).end();
}));

export default router;
