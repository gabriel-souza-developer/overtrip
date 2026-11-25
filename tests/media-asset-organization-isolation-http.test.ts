import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { config } from '../src/config.js';

// MediaAsset agora tem organizationId (nullable, migração aditiva): a
// deduplicação por sha256 no POST /api/media, e a autorização em
// GET /api/public/media/:file, precisam respeitar o mesmo escopo
// legado/público do resto da API, sem nunca reaproveitar ou servir o
// arquivo de outra empresa, e sem deixar de servir arquivos legados sem
// registro no banco (anteriores ao MediaAsset).

const prisma = new PrismaClient();
const TAG = `media-org-test:${Date.now()}`;

let server: Server;
let baseUrl: string;
let directory: string;
let token: string;
let userId: string;
let orgAId: string;
let orgBId: string;
let orgCInactiveId: string;

const jpeg = (seed: number) => sharp({ create: { width: 10, height: 10, channels: 3, background: { r: seed % 255, g: 10, b: 10 } } }).jpeg().toBuffer();

const upload = (body: Buffer) => fetch(`${baseUrl}/api/media`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
  body,
});

/** Grava um arquivo diretamente no disco (sem passar pelo pipeline de upload), simulando um registro de outra empresa ou um arquivo legado sem registro. */
const writeMediaFile = async (filename: string, bytes: Buffer = randomBytes(32)) => writeFile(join(directory, filename), bytes, { mode: 0o640 });

const randomKey = () => randomBytes(16).toString('hex');

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'overtrip-media-org-'));
  vi.stubEnv('UPLOADS_DIR', directory);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const user = await prisma.user.create({
    data: { legacyAccess: true, email: `test:${TAG}@example.com`, passwordHash: 'unused-in-this-test', role: 'admin' },
  });
  userId = user.id;
  token = generateToken(user);

  const [orgA, orgB, orgCInactive] = await Promise.all([
    prisma.organization.create({ data: { name: `${TAG}:A`, slug: `${TAG}-a` } }),
    prisma.organization.create({ data: { name: `${TAG}:B`, slug: `${TAG}-b` } }),
    prisma.organization.create({ data: { name: `${TAG}:C`, slug: `${TAG}-c`, status: 'INACTIVE' } }),
  ]);
  orgAId = orgA.id;
  orgBId = orgB.id;
  orgCInactiveId = orgCInactive.id;
});

afterAll(async () => {
  config.legacyTourismOrganizationId = null;
  config.publicSiteOrganizationIds = [];
  await prisma.mediaAsset.deleteMany({ where: { createdById: userId } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId, orgCInactiveId] } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('POST /api/media: deduplicação por sha256 nunca reaproveita arquivo de outra empresa', () => {
  it('upload idêntico a um arquivo já registrado por outra empresa cria um registro/arquivo próprio, não reaproveita o estrangeiro', async () => {
    const body = await jpeg(1);
    const sha256 = createHash('sha256').update(body).digest('hex');
    const storageKey = randomKey();
    await writeMediaFile(`${storageKey}.jpg`, body);
    for (const width of [640, 960, 1280]) await writeMediaFile(`${storageKey}-w${width}.webp`);
    const foreign = await prisma.mediaAsset.create({ data: {
      organizationId: orgBId, storageKey, path: `/api/public/media/${storageKey}.jpg`, mimeType: 'image/jpeg',
      width: 10, height: 10, sizeBytes: body.length, originalBytes: body.length, sha256, createdById: userId, publishedAt: new Date(),
    } });

    config.legacyTourismOrganizationId = null; // escopo legado padrão: só organizationId null
    const res = await upload(body);
    expect(res.status).toBe(201);
    const asset = await res.json() as { id: string; src: string };
    expect(asset.id).not.toBe(foreign.id);
    expect(asset.src).not.toContain(storageKey);

    await prisma.mediaAsset.deleteMany({ where: { id: { in: [foreign.id, asset.id] } } });
  });

  it('upload idêntico ao do próprio escopo (mesma organização configurada) continua reaproveitando o arquivo', async () => {
    const body = await jpeg(2);
    const first = await upload(body);
    expect(first.status).toBe(201);
    const firstAsset = await first.json() as { id: string };
    const second = await upload(body);
    expect(second.status).toBe(200);
    expect((await second.json() as { id: string }).id).toBe(firstAsset.id);
    await prisma.mediaAsset.delete({ where: { id: firstAsset.id } });
  });
});

describe('GET /api/public/media/:file: autorização por organização', () => {
  it('arquivo sem registro no banco e sem allowlist nunca é servido (negação por padrão; ver tests/media-asset-publication-state-http.test.ts para a allowlist)', async () => {
    const storageKey = randomKey();
    await writeMediaFile(`${storageKey}.jpg`);
    const res = await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`);
    expect(res.status).toBe(404);
  });

  it('arquivo registrado e publicado com organizationId null (legado/próprio) é servido', async () => {
    const storageKey = randomKey();
    await writeMediaFile(`${storageKey}.jpg`);
    const asset = await prisma.mediaAsset.create({ data: {
      organizationId: null, storageKey, path: `/api/public/media/${storageKey}.jpg`, mimeType: 'image/jpeg',
      width: 10, height: 10, sizeBytes: 10, originalBytes: 10, sha256: 'x'.repeat(64), createdById: userId, publishedAt: new Date(),
    } });
    expect((await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`)).status).toBe(200);
    await prisma.mediaAsset.delete({ where: { id: asset.id } });
  });

  it('arquivo registrado de outra empresa não autorizada nunca é servido (nem o arquivo principal, nem as variantes), com cache no-store', async () => {
    config.publicSiteOrganizationIds = [];
    const storageKey = randomKey();
    await writeMediaFile(`${storageKey}.jpg`);
    await writeMediaFile(`${storageKey}-w640.webp`);
    const asset = await prisma.mediaAsset.create({ data: {
      organizationId: orgBId, storageKey, path: `/api/public/media/${storageKey}.jpg`, mimeType: 'image/jpeg',
      width: 10, height: 10, sizeBytes: 10, originalBytes: 10, sha256: 'y'.repeat(64), createdById: userId, publishedAt: new Date(),
    } });

    const main = await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`);
    expect(main.status).toBe(404);
    expect(main.headers.get('cache-control')).toBe('no-store');
    const variant = await fetch(`${baseUrl}/api/public/media/${storageKey}-w640.webp`);
    expect(variant.status).toBe(404);

    // Autorizando a empresa (e ativa), o mesmo arquivo passa a ser servido.
    config.publicSiteOrganizationIds = [orgBId];
    expect((await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/public/media/${storageKey}-w640.webp`)).status).toBe(200);

    config.publicSiteOrganizationIds = [];
    await prisma.mediaAsset.delete({ where: { id: asset.id } });
  });

  it('arquivo de organização autorizada porém inativa nunca é servido', async () => {
    const storageKey = randomKey();
    await writeMediaFile(`${storageKey}.jpg`);
    const asset = await prisma.mediaAsset.create({ data: {
      organizationId: orgCInactiveId, storageKey, path: `/api/public/media/${storageKey}.jpg`, mimeType: 'image/jpeg',
      width: 10, height: 10, sizeBytes: 10, originalBytes: 10, sha256: 'z'.repeat(64), createdById: userId, publishedAt: new Date(),
    } });

    config.publicSiteOrganizationIds = [orgCInactiveId];
    const res = await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`);
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('no-store');

    config.publicSiteOrganizationIds = [];
    await prisma.mediaAsset.delete({ where: { id: asset.id } });
  });
});

describe('vídeos de viagens no site público', () => {
  it('revalida a situação, a empresa e a referência exata antes de servir o MP4', async () => {
    const storageKey = randomKey();
    const filename = storageKey + '.mp4';
    const src = '/api/public/media/' + filename;
    const bytes = Buffer.from('video fixture');
    await writeMediaFile(filename, bytes);
    const get = () => fetch(baseUrl + src, { headers: { Range: 'bytes=0-4' } });
    expect((await get()).status).toBe(404);
    const asset = await prisma.mediaAsset.create({ data: {
      organizationId: orgAId, storageKey, path: src, mimeType: 'video/mp4', publishedAt: new Date(),
      width: 10, height: 10, sizeBytes: bytes.length, originalBytes: bytes.length, sha256: 'x'.repeat(64), createdById: userId,
    } });
    const media = JSON.stringify([{ src, type: 'video', alt: 'Vídeo de viagem' }]);
    const trip = await prisma.trip.create({ data: {
      organizationId: orgAId, storedIdentity: TAG + ':video', title: 'Viagem com vídeo', category: 'Trilha',
      city: 'Lucena', region: 'PB', description: 'Passeio', startDateISO: new Date(), intensityClass: 'leve',
      includes: '[]', media, status: 'DRAFT',
    } });
    try {
      const headers = { Authorization: 'Bearer ' + token, Range: 'bytes=0-4' };
      const legacyPreview = baseUrl + '/api/media/' + filename;
      const orgPreview = (id: string) => baseUrl + '/api/organizations/' + id + '/tourism/media/' + filename;
      expect((await fetch(legacyPreview)).status).toBe(401);
      config.legacyTourismOrganizationId = null;
      expect((await fetch(legacyPreview, { headers })).status).toBe(404);
      const membership = await prisma.membership.create({ data: { organizationId: orgAId, userId, role: 'OWNER' } });
      try {
        expect((await fetch(orgPreview(orgBId), { headers })).status).toBe(403);
        const preview = await fetch(orgPreview(orgAId), { headers });
        expect(preview.status).toBe(206);
        expect(preview.headers.get('cache-control')).toContain('private');
        expect(await preview.text()).toBe('video');
      } finally {
        await prisma.membership.delete({ where: { id: membership.id } });
      }
      config.publicSiteOrganizationIds = [orgAId, orgBId];
      expect((await get()).status).toBe(404);
      await prisma.trip.update({ where: { id: trip.id }, data: { status: 'REVIEW' } });
      expect((await get()).status).toBe(404);
      await prisma.trip.update({ where: { id: trip.id }, data: { status: 'OPEN', organizationId: orgBId } });
      expect((await get()).status).toBe(404);
      await prisma.trip.update({ where: { id: trip.id }, data: { organizationId: orgAId, media: JSON.stringify([{ src: 'outra.jpg', alt: src }]) } });
      expect((await get()).status).toBe(404);
      await prisma.trip.update({ where: { id: trip.id }, data: { media } });
      config.publicSiteOrganizationIds = [orgBId];
      expect((await get()).status).toBe(404);
      config.publicSiteOrganizationIds = [orgAId];
      const visible = await get();
      expect(visible.status).toBe(206);
      expect(await visible.text()).toBe('video');
      await prisma.trip.update({ where: { id: trip.id }, data: { status: 'DRAFT' } });
      const unpublished = await get();
      expect(unpublished.status).toBe(404);
      expect(unpublished.headers.get('cache-control')).toBe('no-store');
      config.publicSiteOrganizationIds = [];
      await prisma.mediaAsset.update({ where: { id: asset.id }, data: { organizationId: null } });
      expect((await fetch(legacyPreview, { headers })).status).toBe(206);
      await prisma.trip.update({ where: { id: trip.id }, data: { status: 'OPEN' } });
      expect((await get()).status).toBe(404);
      await prisma.trip.update({ where: { id: trip.id }, data: { organizationId: null } });
      expect((await get()).status).toBe(206);
      await prisma.mediaAsset.update({ where: { id: asset.id }, data: { publishedAt: null } });
      expect((await get()).status).toBe(404);
    } finally {
      config.publicSiteOrganizationIds = [];
      await prisma.trip.delete({ where: { id: trip.id } });
      await prisma.mediaAsset.delete({ where: { id: asset.id } });
    }
  });
});
