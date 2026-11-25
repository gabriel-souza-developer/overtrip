import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { config } from '../src/config.js';
import { writeLegacyMediaAllowlist } from '../scripts/lib/legacyMediaInventory.js';

// Revisão independente: mediaRoutes gravava arquivo antes de criar o
// MediaAsset; nessa janela (ou permanentemente, após SIGKILL/queda/falha de
// limpeza) o arquivo existia em disco sem registro, e a rota pública tratava
// "sem registro" como legado e servia. Agora: o registro nasce pendente
// (publishedAt null) ANTES de qualquer gravação, e a rota pública nunca serve
// nada pendente; "sem registro nenhum" só é servido se constar numa allowlist
// explícita e auditável (gerada por scripts/inventory-legacy-media.ts), nunca
// por padrão.

const prisma = new PrismaClient();
const TAG = `media-publication-test:${Date.now()}`;

let server: Server;
let baseUrl: string;
let directory: string;
let token: string;
let userId: string;
let orgBId: string;

const randomKey = () => randomBytes(16).toString('hex');
const writeMediaFile = async (filename: string, content: Buffer = randomBytes(16)) => {
  await writeFile(join(directory, filename), content, { mode: 0o640 });
  return content;
};
const fileIdentity = (content: Buffer) => ({ sizeBytes: content.length, sha256: createHash('sha256').update(content).digest('hex') });

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'overtrip-media-publication-'));
  vi.stubEnv('UPLOADS_DIR', directory);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const user = await prisma.user.create({
    data: { legacyAccess: true, email: `test:${TAG}@example.com`, passwordHash: 'unused-in-this-test', role: 'admin' },
  });
  userId = user.id;
  token = generateToken(user);
  const orgB = await prisma.organization.create({ data: { name: `${TAG}:B`, slug: `${TAG}-b` } });
  orgBId = orgB.id;
});

afterAll(async () => {
  config.publicSiteOrganizationIds = [];
  await prisma.mediaAsset.deleteMany({ where: { createdById: userId } });
  await prisma.organization.delete({ where: { id: orgBId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /api/public/media/:file: estado pendente nunca é servido (janela de upload, restos de falha)', () => {
  it('registro pendente (publishedAt null) com arquivo completo em disco nunca é servido — nem o principal, nem a variante', async () => {
    const storageKey = randomKey();
    await writeMediaFile(`${storageKey}.jpg`);
    await writeMediaFile(`${storageKey}-w640.webp`);
    const pending = await prisma.mediaAsset.create({ data: {
      organizationId: null, storageKey, path: `/api/public/media/${storageKey}.jpg`, mimeType: 'image/jpeg',
      width: 10, height: 10, sizeBytes: 10, originalBytes: 10, sha256: 'p'.repeat(64), createdById: userId,
      publishedAt: null,
    } });

    const main = await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`);
    expect(main.status).toBe(404);
    expect(main.headers.get('cache-control')).toBe('no-store');
    expect((await fetch(`${baseUrl}/api/public/media/${storageKey}-w640.webp`)).status).toBe(404);

    // Publicando o mesmo registro (como a rota de upload faz ao terminar de
    // gravar), o arquivo passa a ser servido imediatamente — mesma consulta,
    // sem nenhum estado intermediário a mais.
    await prisma.mediaAsset.update({ where: { id: pending.id }, data: { publishedAt: new Date() } });
    expect((await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`)).status).toBe(200);

    await prisma.mediaAsset.delete({ where: { id: pending.id } });
  });

  it('registro pendente sem arquivo nenhum em disco (queda antes de gravar) também nunca é servido', async () => {
    const storageKey = randomKey();
    const pending = await prisma.mediaAsset.create({ data: {
      organizationId: null, storageKey, path: `/api/public/media/${storageKey}.jpg`, mimeType: 'image/jpeg',
      width: 10, height: 10, sizeBytes: 10, originalBytes: 10, sha256: 'q'.repeat(64), createdById: userId,
      publishedAt: null,
    } });
    expect((await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`)).status).toBe(404);
    await prisma.mediaAsset.delete({ where: { id: pending.id } });
  });

  it('registro pendente de outra organização nunca é servido mesmo depois de publicado sem autorização', async () => {
    const storageKey = randomKey();
    await writeMediaFile(`${storageKey}.jpg`);
    const pending = await prisma.mediaAsset.create({ data: {
      organizationId: orgBId, storageKey, path: `/api/public/media/${storageKey}.jpg`, mimeType: 'image/jpeg',
      width: 10, height: 10, sizeBytes: 10, originalBytes: 10, sha256: 'r'.repeat(64), createdById: userId,
      publishedAt: null,
    } });
    expect((await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`)).status).toBe(404);

    await prisma.mediaAsset.update({ where: { id: pending.id }, data: { publishedAt: new Date() } });
    // Publicado, mas a organização continua não autorizada: ainda 404.
    expect((await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`)).status).toBe(404);

    await prisma.mediaAsset.delete({ where: { id: pending.id } });
  });
});

describe('GET /api/public/media/:file: URLs legadas inventariadas (allowlist explícita, nome exato + conteúdo reconferido)', () => {
  it('sem allowlist, arquivo sem registro nunca é servido (negação por padrão)', async () => {
    const storageKey = randomKey();
    await writeMediaFile(`${storageKey}.jpg`);
    expect((await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`)).status).toBe(404);
  });

  it('aprovar o arquivo principal nunca libera uma variante não revisada com o mesmo storageKey (nem outro storageKey não listado)', async () => {
    const allowlistPath = join(directory, '.legacy-media-allowlist.json');
    const listedKey = randomKey();
    const unlistedKey = randomKey();
    const mainContent = await writeMediaFile(`${listedKey}.jpg`);
    await writeMediaFile(`${listedKey}-w640.webp`); // nunca proposta pelo inventário, nunca aprovada
    await writeMediaFile(`${unlistedKey}.jpg`);
    try {
      await writeLegacyMediaAllowlist(allowlistPath, [{ filename: `${listedKey}.jpg`, ...fileIdentity(mainContent) }]);
      expect((await fetch(`${baseUrl}/api/public/media/${listedKey}.jpg`)).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/public/media/${listedKey}-w640.webp`)).status).toBe(404);
      expect((await fetch(`${baseUrl}/api/public/media/${unlistedKey}.jpg`)).status).toBe(404);
    } finally {
      await rm(allowlistPath, { force: true });
    }
  });

  it('uma variante WebP legada órfã pode ser aprovada individualmente (seu próprio nome, seu próprio hash) e é servida mesmo que o arquivo principal do mesmo storageKey nunca tenha sido revisado/aprovado', async () => {
    const allowlistPath = join(directory, '.legacy-media-allowlist.json');
    const key = randomKey();
    await writeMediaFile(`${key}.jpg`); // principal: nunca aprovado
    const variantContent = await writeMediaFile(`${key}-w640.webp`);
    await writeMediaFile(`${key}-w960.webp`); // outra variante: também nunca aprovada
    try {
      await writeLegacyMediaAllowlist(allowlistPath, [{ filename: `${key}-w640.webp`, ...fileIdentity(variantContent) }]);
      expect((await fetch(`${baseUrl}/api/public/media/${key}-w640.webp`)).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/public/media/${key}.jpg`)).status).toBe(404);
      expect((await fetch(`${baseUrl}/api/public/media/${key}-w960.webp`)).status).toBe(404);
    } finally {
      await rm(allowlistPath, { force: true });
    }
  });

  it('conteúdo alterado depois da aprovação nunca é servido — a rota reconfere tamanho e hash a cada requisição, nunca confia só no nome aprovado', async () => {
    const allowlistPath = join(directory, '.legacy-media-allowlist.json');
    const key = randomKey();
    const original = await writeMediaFile(`${key}.jpg`, Buffer.from('conteudo-original-revisado'));
    try {
      await writeLegacyMediaAllowlist(allowlistPath, [{ filename: `${key}.jpg`, ...fileIdentity(original) }]);
      expect((await fetch(`${baseUrl}/api/public/media/${key}.jpg`)).status).toBe(200);
      await writeMediaFile(`${key}.jpg`, Buffer.from('conteudo-trocado-depois'));
      const res = await fetch(`${baseUrl}/api/public/media/${key}.jpg`);
      expect(res.status).toBe(404);
    } finally {
      await rm(allowlistPath, { force: true });
    }
  });

  it('link simbólico no lugar do arquivo aprovado nunca é servido, mesmo apontando para um arquivo real', async () => {
    const allowlistPath = join(directory, '.legacy-media-allowlist.json');
    const key = randomKey();
    const content = await writeMediaFile(`${key}.jpg`, Buffer.from('vai-virar-link'));
    const target = join(directory, 'fora-do-padrao.jpg');
    await writeFile(target, content);
    try {
      await writeLegacyMediaAllowlist(allowlistPath, [{ filename: `${key}.jpg`, ...fileIdentity(content) }]);
      expect((await fetch(`${baseUrl}/api/public/media/${key}.jpg`)).status).toBe(200);
      await rm(join(directory, `${key}.jpg`));
      await symlink(target, join(directory, `${key}.jpg`));
      const res = await fetch(`${baseUrl}/api/public/media/${key}.jpg`);
      expect(res.status).toBe(404);
    } finally {
      await rm(allowlistPath, { force: true });
    }
  });

  it('allowlist malformada é tratada como vazia (negação por padrão), nunca como erro nem como fallback permissivo', async () => {
    const allowlistPath = join(directory, '.legacy-media-allowlist.json');
    const storageKey = randomKey();
    await writeMediaFile(`${storageKey}.jpg`);
    try {
      await writeFile(allowlistPath, '{not valid json');
      const res = await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`);
      expect(res.status).toBe(404);
    } finally {
      await rm(allowlistPath, { force: true });
    }
  });
});

describe('GET /api/public/media/:file: cache nunca é imutável de longo prazo (revogação)', () => {
  it('arquivo publicado e autorizado é servido com Cache-Control: no-cache (revalida sempre), nunca immutable/1 ano', async () => {
    const storageKey = randomKey();
    await writeMediaFile(`${storageKey}.jpg`);
    const asset = await prisma.mediaAsset.create({ data: {
      organizationId: null, storageKey, path: `/api/public/media/${storageKey}.jpg`, mimeType: 'image/jpeg',
      width: 10, height: 10, sizeBytes: 10, originalBytes: 10, sha256: 's'.repeat(64), createdById: userId,
      publishedAt: new Date(),
    } });
    const res = await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    await prisma.mediaAsset.delete({ where: { id: asset.id } });
  });

  it('revogar a organização autorizada derruba o acesso na próxima requisição, sem exigir nenhuma invalidação de cache do lado do servidor', async () => {
    const storageKey = randomKey();
    await writeMediaFile(`${storageKey}.jpg`);
    const asset = await prisma.mediaAsset.create({ data: {
      organizationId: orgBId, storageKey, path: `/api/public/media/${storageKey}.jpg`, mimeType: 'image/jpeg',
      width: 10, height: 10, sizeBytes: 10, originalBytes: 10, sha256: 't'.repeat(64), createdById: userId,
      publishedAt: new Date(),
    } });
    config.publicSiteOrganizationIds = [orgBId];
    expect((await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`)).status).toBe(200);

    // Revogação: a empresa deixa de estar autorizada.
    config.publicSiteOrganizationIds = [];
    const revoked = await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`);
    expect(revoked.status).toBe(404);
    expect(revoked.headers.get('cache-control')).toBe('no-store');

    await prisma.mediaAsset.delete({ where: { id: asset.id } });
  });
});

describe('GET /api/public/media/:file: nunca segue link simbólico, mesmo para um registro publicado e autorizado', () => {
  it('arquivo de um registro publicado trocado por link simbólico nunca é servido', async () => {
    const storageKey = randomKey();
    const content = await writeMediaFile(`${storageKey}.jpg`);
    const target = join(directory, 'fora-do-padrao-registrado.jpg');
    await writeFile(target, content);
    const asset = await prisma.mediaAsset.create({ data: {
      organizationId: null, storageKey, path: `/api/public/media/${storageKey}.jpg`, mimeType: 'image/jpeg',
      width: 10, height: 10, sizeBytes: 10, originalBytes: 10, sha256: 'u'.repeat(64), createdById: userId,
      publishedAt: new Date(),
    } });
    expect((await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`)).status).toBe(200);

    await rm(join(directory, `${storageKey}.jpg`));
    await symlink(target, join(directory, `${storageKey}.jpg`));
    const res = await fetch(`${baseUrl}/api/public/media/${storageKey}.jpg`);
    expect(res.status).toBe(404);

    await prisma.mediaAsset.delete({ where: { id: asset.id } });
  });
});
