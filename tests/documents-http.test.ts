import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { purgeExpiredDocuments } from '../src/services/documentRetention.js';
const scanner = vi.hoisted(() => ({ code: 0 }));
vi.mock('node:child_process', () => ({ execFile: (_bin: string, _args: string[], _options: unknown, callback: Function) => callback(scanner.code ? { code: scanner.code } : null) }));
let directory: string;

const prisma = new PrismaClient();

let server: Server;
let baseUrl: string;
let token: string;
let userId: string;
let tripId: string;
let nonAdminToken: string;
let nonAdminUserId: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'overtrip-documents-'));
  vi.stubEnv('DOCUMENT_STORAGE_DIR', directory);
  vi.stubEnv('DOCUMENT_CLAMDSCAN_PATH', '/usr/bin/clamdscan');
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const user = await prisma.user.create({
    data: {
      email: `test:document-http:${Date.now()}@example.com`,
      passwordHash: 'unused-in-this-test',
      role: 'admin',
    },
  });
  userId = user.id;
  token = generateToken({ id: user.id, email: user.email, role: user.role });

  const nonAdminUser = await prisma.user.create({
    data: {
      email: `test:document-http:non-admin:${Date.now()}@example.com`,
      passwordHash: 'unused-in-this-test',
      role: 'editor',
    },
  });
  nonAdminUserId = nonAdminUser.id;
  nonAdminToken = generateToken({ id: nonAdminUser.id, email: nonAdminUser.email, role: nonAdminUser.role });

  const trip = await prisma.trip.create({
    data: {
      title: 'Trip Publish HTTP Test',
      category: 'Test',
      description: 'Test',
      city: 'City',
      region: 'PB',
      startDateISO: new Date('2026-12-01T06:00:00-03:00'),
      intensityClass: 'moderado',
      includes: JSON.stringify([]),
      priceValue: 100,
      meetingTBD: true,
      media: JSON.stringify([{ src: 'https://example.com/publish.jpg', alt: 'Foto da viagem' }]),
      storedIdentity: `document-http-test:${Date.now()}`,
    },
  });
  tripId = trip.id;
});

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: 'document-http-test:' } } });
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.user.delete({ where: { id: nonAdminUserId } }).catch(() => {});
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const pdf = '%PDF-1.7\nfixture';
const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf', 'X-Document-Filename': 'roteiro.pdf' });
const url = () => `${baseUrl}/api/trips/${tripId}/documents`;
const upload = () => fetch(url(), { method: 'POST', headers: headers(), body: pdf });

describe('documentos privados (HTTP real; scanner simulado)', () => {
  it('exige administrador antes de ler o corpo', async () => {
    expect((await fetch(url())).status).toBe(401);
    expect((await fetch(url(), { headers: { Authorization: `Bearer ${nonAdminToken}` } })).status).toBe(403);
    const suggestionUrl = `${url()}/missing/suggestions`;
    expect((await fetch(suggestionUrl, { method: 'POST' })).status).toBe(401);
    expect((await fetch(suggestionUrl, { method: 'POST', headers: { Authorization: `Bearer ${nonAdminToken}` } })).status).toBe(403);
    expect((await fetch(suggestionUrl, { method: 'POST', headers: headers() })).status).toBe(404);
  });
  it('recusa assinatura falsa e arquivo acima do limite', async () => {
    expect((await fetch(url(), { method: 'POST', headers: headers(), body: 'falso' })).status).toBe(400);
    expect((await fetch(url(), { method: 'POST', headers: headers(), body: '%PDF-' + 'a'.repeat(10 * 1024 * 1024) })).status).toBe(413);
  });
  it('falha fechado quando scanner falha e remove arquivo temporário', async () => {
    scanner.code = 2;
    expect((await upload()).status).toBe(503);
    expect(await readdir(directory)).toEqual([]);
    scanner.code = 1;
    expect((await upload()).status).toBe(422);
    expect(await readdir(directory)).toEqual([]);
    scanner.code = 0;
  });
  it('isola a geração de sugestões por viagem, estado e prazo', async () => {
    const document = await prisma.tripDocument.create({ data: {
      tripId, storageKey: `suggestion-${Date.now()}.pdf`, originalFilename: 'suggestion.pdf', mimeType: 'application/pdf',
      sizeBytes: 100, sha256: 'fixture', createdById: userId, scanStatus: 'CLEAN', extractionStatus: 'PENDING',
      retentionUntil: new Date(Date.now() + 60_000),
    } });
    const endpoint = `${url()}/${document.id}/suggestions`;
    const request = (u: string) => fetch(u, { method: 'POST', headers: headers() });
    expect((await request(endpoint)).status).toBe(404);
    await prisma.tripDocument.update({ where: { id: document.id }, data: { extractionStatus: 'READY' } });
    expect((await request(`${baseUrl}/api/trips/other/documents/${document.id}/suggestions`)).status).toBe(404);
    vi.stubEnv('DOCUMENT_AI_EXTERNAL_ENABLED', '');
    const disabled = await request(endpoint);
    expect(disabled.status).toBe(503);
    expect(await disabled.json()).toEqual({ error: 'A análise de documentos por IA externa está desativada neste ambiente.' });
    vi.stubEnv('DOCUMENT_AI_EXTERNAL_ENABLED', 'true');
    vi.stubEnv('GEMINI_API_KEY', ''); vi.stubEnv('GOOGLE_API_KEY', ''); vi.stubEnv('ANTHROPIC_API_KEY', '');
    const unavailable = await request(endpoint);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('cache-control')).toBe('no-store');
    await prisma.tripDocument.update({ where: { id: document.id }, data: { retentionUntil: new Date(0) } });
    expect((await request(endpoint)).status).toBe(404);
    await prisma.tripDocument.delete({ where: { id: document.id } });
  });
  it('envia, lista, baixa, bloqueia outra viagem e exclui um PDF', async () => {
    const response = await upload();
    expect(response.status).toBe(201);
    const document = await response.json();
    expect(document.storageKey).toBeUndefined();
    const list = await fetch(url(), { headers: headers() });
    expect((await list.json()).map((item: { id: string }) => item.id)).toContain(document.id);
    const download = await fetch(`${url()}/${document.id}`, { headers: headers() });
    expect(download.headers.get('content-disposition')).toContain('attachment');
    expect(download.headers.get('cache-control')).toBe('no-store');
    expect(await download.text()).toBe(pdf);
    expect((await fetch(`${baseUrl}/api/trips/other/documents/${document.id}`, { headers: headers() })).status).toBe(404);
    expect((await fetch(`${url()}/${document.id}`, { method: 'DELETE', headers: headers() })).status).toBe(204);
    expect(await readdir(directory)).toEqual([]);
  });
  it('remove arquivo e metadados expirados', async () => {
    // Cria o registro diretamente para não consumir a cota de uploads do teste.
    const { storeScannedPdf } = await import('../src/services/documentStorage.js');
    const stored = await storeScannedPdf(Buffer.from(pdf));
    const document = await prisma.tripDocument.create({ data: {
      tripId, storageKey: stored.key, originalFilename: 'expired.pdf', mimeType: 'application/pdf',
      sizeBytes: pdf.length, sha256: 'fixture', createdById: userId, scanStatus: 'CLEAN', retentionUntil: new Date(0),
    } });
    expect((await fetch(`${url()}/${document.id}`, { headers: headers() })).status).toBe(404);
    await purgeExpiredDocuments();
    expect(await prisma.tripDocument.findUnique({ where: { id: document.id } })).toBeNull();
    expect(await readdir(directory)).toEqual([]);
  });
});
