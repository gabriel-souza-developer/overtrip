import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { get, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import app from '../src/app.js';
import { prisma as appPrisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';
import { MEDIA_MAX_BYTES, MEDIA_MAX_DIMENSION } from '../src/services/mediaUpload.js';

const prisma = new PrismaClient();
let server: Server;
let baseUrl: string;
let directory: string;
const users: Record<string, { id: string; token: string }> = {};

const jpeg = () => sharp({ create: { width: 300, height: 200, channels: 3, background: '#E26B1B' } })
  .jpeg().withMetadata({ orientation: 6 }).withExif({ IFD0: { Make: 'CameraDeTeste' } }).toBuffer();

const upload = (body: Buffer | string, { token = users.admin.token, type = 'image/jpeg' }: { token?: string | null; type?: string } = {}) =>
  fetch(`${baseUrl}/api/media`, {
    method: 'POST',
    headers: { 'Content-Type': type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body,
  });

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'overtrip-media-'));
  vi.stubEnv('UPLOADS_DIR', directory);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const role of ['admin', 'editor', 'viewer']) {
    const user = await prisma.user.create({ data: { legacyAccess: true, email: `test:media-http:${role}:${Date.now()}@example.com`, passwordHash: 'x', role } });
    users[role] = { id: user.id, token: generateToken(user) };
  }
});

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: 'test:media-save:' } } });
  await prisma.mediaAsset.deleteMany({ where: { createdById: { in: Object.values(users).map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } });
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('POST /api/media', () => {
  it('exige login (401) e papel permitido (403)', async () => {
    expect((await upload(await jpeg(), { token: null })).status).toBe(401);
    expect((await upload(await jpeg(), { token: 'invalido' })).status).toBe(401);
    expect((await upload(await jpeg(), { token: users.viewer.token })).status).toBe(403);
  });

  it('recusa tipo falso e formatos não aceitos (415)', async () => {
    expect((await upload('<html><script>alert(1)</script></html>')).status).toBe(415);
    expect((await upload(await jpeg(), { type: 'text/html' })).status).toBe(415);
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } }).gif().toBuffer();
    expect((await upload(gif, { type: 'image/gif' })).status).toBe(415);
    expect((await upload(gif, { type: 'image/jpeg' })).status).toBe(415);
  });

  it('recusa arquivo grande (413) e dimensão excessiva (413)', async () => {
    const big = Buffer.concat([await jpeg(), Buffer.alloc(MEDIA_MAX_BYTES)]);
    expect((await upload(big)).status).toBe(413);
    const bomb = await sharp({ create: { width: MEDIA_MAX_DIMENSION + 1, height: 8, channels: 3, background: '#000' } }).png().toBuffer();
    const response = await upload(bomb, { type: 'image/png' });
    expect(response.status).toBe(413);
    expect((await response.json()).error).toMatch(/grande demais/);
  });

  it('salva em disco (201), sem EXIF, com variantes e metadados no banco', async () => {
    const input = await jpeg();
    const response = await upload(input, { token: users.editor.token });
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const asset = await response.json();
    expect(asset.src).toMatch(/^\/api\/public\/media\/[0-9a-f]{32}\.jpg$/);
    expect(asset).toMatchObject({ width: 200, height: 300, mimeType: 'image/jpeg' });
    expect(asset.variants.map((v: { src: string }) => v.src)).toEqual([640, 960, 1280].map((w) => asset.src.replace(/\.jpg$/, `-w${w}.webp`)));

    const files = await readdir(directory);
    expect(files).toHaveLength(4);
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(row).toMatchObject({ path: asset.src, createdById: users.editor.id, originalBytes: input.length });
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);

    const served = await fetch(baseUrl + asset.src);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/jpeg');
    // Sempre revalida: a organização de um arquivo pode ser desativada depois
    // de servido, então um cache compartilhado nunca deve reservir sem
    // consultar a origem (ver deploy/ORACLE_STATUS.md).
    expect(served.headers.get('cache-control')).toBe('no-cache');
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');
    const bytes = Buffer.from(await served.arrayBuffer());
    expect((await sharp(bytes).metadata()).exif).toBeUndefined();
    expect(bytes.toString('latin1')).not.toContain('CameraDeTeste');

    const variant = await fetch(baseUrl + asset.variants[0].src);
    expect(variant.headers.get('content-type')).toBe('image/webp');
    const etag = served.headers.get('etag')!;
    // fetch acrescenta Cache-Control: no-cache a pedidos condicionais; o navegador não.
    const conditional = await new Promise<number>((resolve, reject) => {
      get(baseUrl + asset.src, { headers: { 'If-None-Match': etag } }, (r) => { r.resume(); resolve(r.statusCode!); }).on('error', reject);
    });
    expect(conditional).toBe(304);

    // O mesmo arquivo enviado de novo não duplica nada.
    const again = await upload(input);
    expect(again.status).toBe(200);
    expect((await again.json()).id).toBe(asset.id);
    expect(await readdir(directory)).toHaveLength(4);
  });

  it('se a chamada que publica falhar DEPOIS de outro processo já ter publicado o mesmo pendente concorrentemente (ex.: corrida com reconciliação, ou a própria chamada tendo sido efetivada no servidor apesar do erro), o rollback do envio NUNCA apaga o ativo já publicado nem seus arquivos', async () => {
    // Conteúdo próprio (nunca o de jpeg()): precisa de um hash inédito para
    // não cair no caminho de reaproveitar um upload já publicado antes de
    // chegar na chamada que este teste precisa interceptar.
    const input = await sharp({ create: { width: 301, height: 199, channels: 3, background: '#1A2B3C' } }).jpeg().toBuffer();
    const sha256 = createHash('sha256').update(input).digest('hex');
    const spy = vi.spyOn(appPrisma.mediaAsset, 'update').mockImplementationOnce(async (args: { where: { id: string } }) => {
      // Simula outro processo publicando o MESMO pendente concorrentemente
      // (ex.: uma futura ferramenta de publicação manual, ou a própria
      // chamada tendo sido efetivada no banco mesmo que a promise rejeite
      // por erro de rede na resposta) — via updateMany, nunca via update
      // (que está mockado aqui e recursaria).
      await appPrisma.mediaAsset.updateMany({ where: { id: args.where.id }, data: { publishedAt: new Date() } });
      throw new Error('falha simulada depois da escrita já efetivada');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await upload(input, { token: users.admin.token });
      expect(response.status).toBe(500);
    } finally {
      spy.mockRestore();
      log.mockRestore();
    }

    const row = await prisma.mediaAsset.findFirstOrThrow({ where: { sha256, originalBytes: input.length } });
    expect(row.publishedAt).not.toBeNull(); // continua publicado: o rollback nunca o apagou
    const files = await readdir(directory);
    const ext = row.mimeType === 'image/png' ? 'png' : 'jpg';
    expect(files).toContain(`${row.storageKey}.${ext}`);
    expect(files).toContain(`${row.storageKey}-w640.webp`);

    await prisma.mediaAsset.delete({ where: { id: row.id } });
  });

  it('mantém a foto ao salvar e consultar novamente uma viagem em rascunho', async () => {
    const imageResponse = await upload(await jpeg(), { token: users.editor.token });
    expect([200, 201]).toContain(imageResponse.status);
    const image = await imageResponse.json();
    const media = [{ src: image.src, alt: 'Grupo na trilha', type: 'image' }];
    const created = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${users.editor.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Foto no rascunho', category: 'Trilha', description: 'Passeio', city: 'Lucena', region: 'PB', startDateISO: '2026-12-01T09:00:00.000Z', storedIdentity: `test:media-save:${Date.now()}`, media }),
    });
    expect(created.status).toBe(201);
    const trip = await created.json();
    expect(trip.status).toBe('DRAFT');
    const reloaded = await fetch(`${baseUrl}/api/trips/${trip.id}`, { headers: { Authorization: `Bearer ${users.editor.token}` } });
    expect(reloaded.status).toBe(200);
    expect((await reloaded.json()).media).toEqual(media);
    expect((await fetch(baseUrl + image.src)).status).toBe(200);
  });
});

describe('GET /api/public/media/:file', () => {
  it.each([
    '..%2Fetc%2Fpasswd',
    '0123456789abcdef0123456789abcdef.svg',
    '0123456789abcdef0123456789abcdef.jpg',
    '.env',
  ])('responde 404 para %s', async (file) => {
    const response = await fetch(`${baseUrl}/api/public/media/${file}`);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
