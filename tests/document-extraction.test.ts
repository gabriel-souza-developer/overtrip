import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { extractNextDocument } from '../src/services/documentExtraction.js';

const prisma = new PrismaClient();
let directory: string;
let tripId: string;
let extractor: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'overtrip-extraction-'));
  extractor = join(directory, 'extractor');
  vi.stubEnv('DOCUMENT_STORAGE_DIR', directory);
  vi.stubEnv('DOCUMENT_PDFTOTEXT_PATH', extractor);
  const trip = await prisma.trip.create({ data: {
    title: 'Extração', category: 'Test', description: 'Test', city: 'City', region: 'PB',
    startDateISO: new Date('2027-01-01'), intensityClass: 'moderado', includes: '[]',
    priceValue: 100, meetingTBD: true, media: '[]', storedIdentity: `extraction-test:${randomUUID()}`,
  } });
  tripId = trip.id;
});

beforeEach(async () => {
  await prisma.tripDocument.deleteMany({ where: { tripId } });
});

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { id: tripId } });
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

async function script(body: string) {
  await writeFile(extractor, `#!/bin/sh\n${body}\n`, { mode: 0o700 });
  await chmod(extractor, 0o700);
}

async function document(overrides: Record<string, unknown> = {}) {
  const key = `${randomUUID()}.pdf`;
  await writeFile(join(directory, key), '%PDF-1.7\nfixture');
  return prisma.tripDocument.create({ data: {
    tripId, storageKey: key, originalFilename: 'roteiro.pdf', mimeType: 'application/pdf',
    sizeBytes: 16, sha256: 'fixture', createdById: 'test', scanStatus: 'CLEAN',
    extractionStatus: 'PENDING', retentionUntil: new Date(Date.now() + 60_000), ...overrides,
  } });
}

describe('worker de extração de documentos', () => {
  it('salva texto privado por página e marca o documento como pronto', async () => {
    await script("printf 'Primeira página\\fSegunda página\\f'");
    const doc = await document();
    expect(await extractNextDocument()).toBe(true);
    const result = await prisma.tripDocument.findUniqueOrThrow({ where: { id: doc.id }, include: { pages: { orderBy: { pageNumber: 'asc' } } } });
    expect(result.extractionStatus).toBe('READY');
    expect(result.extractedAt).not.toBeNull();
    expect(result.pages.map(page => [page.pageNumber, page.text])).toEqual([[1, 'Primeira página'], [2, 'Segunda página']]);
    expect(await extractNextDocument()).toBe(false);
  });

  it('registra falha sem persistir conteúdo de erro do processo', async () => {
    await script("echo 'segredo-do-documento' >&2; exit 1");
    const doc = await document();
    expect(await extractNextDocument()).toBe(true);
    const result = await prisma.tripDocument.findUniqueOrThrow({ where: { id: doc.id }, include: { pages: true } });
    expect(result.extractionStatus).toBe('FAILED');
    expect(result.extractionError).not.toContain('segredo-do-documento');
    expect(result.pages).toEqual([]);
  });

  it('não processa documentos expirados ou sem varredura limpa', async () => {
    await script("printf 'não deveria processar\\f'");
    const expired = await document({ retentionUntil: new Date(0) });
    const unscanned = await document({ scanStatus: 'PENDING_SCAN' });
    expect(await extractNextDocument()).toBe(false);
    const docs = await prisma.tripDocument.findMany({ where: { id: { in: [expired.id, unscanned.id] } } });
    expect(docs.map(doc => doc.extractionStatus)).toEqual(['PENDING', 'PENDING']);
  });

  it('recupera processamento interrompido sem reclamar uma tarefa recente', async () => {
    await script("printf 'Recuperado\\f'");
    const recent = await document({ extractionStatus: 'PROCESSING', extractionStartedAt: new Date() });
    const stale = await document({ extractionStatus: 'PROCESSING', extractionStartedAt: new Date(Date.now() - 3 * 60_000) });
    expect(await extractNextDocument()).toBe(true);
    expect((await prisma.tripDocument.findUniqueOrThrow({ where: { id: stale.id } })).extractionStatus).toBe('READY');
    expect((await prisma.tripDocument.findUniqueOrThrow({ where: { id: recent.id } })).extractionStatus).toBe('PROCESSING');
  });

  it('identifica um PDF sem texto extraível', async () => {
    await script("printf '  \\f'");
    const doc = await document();
    expect(await extractNextDocument()).toBe(true);
    const result = await prisma.tripDocument.findUniqueOrThrow({ where: { id: doc.id }, include: { pages: true } });
    expect(result.extractionStatus).toBe('FAILED');
    expect(result.extractionError).toBe('NO_TEXT');
    expect(result.pages).toEqual([]);
  });
});
