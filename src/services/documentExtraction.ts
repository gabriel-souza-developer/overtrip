import { execFile } from 'node:child_process';
import path from 'node:path';
import { access, constants } from 'node:fs/promises';
import { prisma } from '../lib/prisma.js';
import { documentDirectory, documentPath } from './documentStorage.js';

const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_PAGES = 100;
const LEASE_MS = 2 * 60 * 1000;

export async function assertExtractionConfigured(): Promise<void> {
  const parser = process.env.DOCUMENT_PDFTOTEXT_PATH;
  if (!parser || !path.isAbsolute(parser)) throw new Error('PARSER_UNAVAILABLE');
  await access(parser, constants.X_OK);
}

/** A saída e os erros do parser nunca são enviados a logs ou ao cliente. */
async function extractPdf(file: string): Promise<string[]> {
  const parser = process.env.DOCUMENT_PDFTOTEXT_PATH;
  if (!parser || !path.isAbsolute(parser)) throw new Error('PARSER_UNAVAILABLE');
  const output = await new Promise<string>((resolve, reject) => {
    execFile(parser, ['-enc', 'UTF-8', '-l', String(MAX_PAGES + 1), '-layout', file, '-'], {
      timeout: 30_000, maxBuffer: MAX_TEXT_BYTES, encoding: 'utf8',
    }, (error, stdout) => error ? reject(new Error(error.code === 'ENOENT' || error.code === 'EACCES' ? 'PARSER_UNAVAILABLE' : 'EXTRACTION_FAILED')) : resolve(stdout));
  });
  const pages = output.split('\f');
  // Poppler encerra cada página com form feed, inclusive a última.
  if (pages.at(-1) === '') pages.pop();
  if (pages.length > MAX_PAGES) throw new Error('PAGE_LIMIT');
  if (!pages.some(page => page.trim())) throw new Error('NO_TEXT');
  return pages;
}

/** Reclama no banco uma tarefa por vez, permitindo múltiplos processos e recuperação de queda. */
export async function extractNextDocument(): Promise<boolean> {
  await assertExtractionConfigured();
  const directory = await documentDirectory();
  const now = new Date();
  const candidate = await prisma.tripDocument.findFirst({
    where: {
      scanStatus: 'CLEAN', deletedAt: null, retentionUntil: { gt: now },
      OR: [{ extractionStatus: 'PENDING' }, { extractionStatus: 'PROCESSING', extractionStartedAt: { lt: new Date(now.getTime() - LEASE_MS) } }],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!candidate) return false;
  const claimedAt = new Date();
  const claim = await prisma.tripDocument.updateMany({
    where: { id: candidate.id, extractionStatus: candidate.extractionStatus, extractionStartedAt: candidate.extractionStartedAt, scanStatus: 'CLEAN', deletedAt: null, retentionUntil: { gt: claimedAt } },
    data: { extractionStatus: 'PROCESSING', extractionStartedAt: claimedAt, extractionError: null, extractedAt: null },
  });
  if (!claim.count) return true;
  const ownership = { id: candidate.id, extractionStatus: 'PROCESSING', extractionStartedAt: claimedAt, scanStatus: 'CLEAN', deletedAt: null, retentionUntil: { gt: new Date() } };
  try {
    const pages = await extractPdf(documentPath(directory, candidate.storageKey));
    await prisma.$transaction(async tx => {
      const updated = await tx.tripDocument.updateMany({ where: { ...ownership, retentionUntil: { gt: new Date() } }, data: { extractionStatus: 'READY', extractedAt: new Date(), extractionError: null } });
      if (!updated.count) return;
      await tx.tripDocumentPage.deleteMany({ where: { documentId: candidate.id } });
      await tx.tripDocumentPage.createMany({ data: pages.map((text, index) => ({ documentId: candidate.id, pageNumber: index + 1, text })) });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'PARSER_UNAVAILABLE') {
      await prisma.tripDocument.updateMany({ where: ownership, data: { extractionStatus: 'PENDING', extractionStartedAt: null } });
      throw error;
    }
    const code = error instanceof Error && ['PAGE_LIMIT', 'NO_TEXT'].includes(error.message) ? error.message : 'EXTRACTION_FAILED';
    await prisma.tripDocument.updateMany({ where: { ...ownership, retentionUntil: { gt: new Date() } }, data: { extractionStatus: 'FAILED', extractionError: code } });
  }
  return true;
}
