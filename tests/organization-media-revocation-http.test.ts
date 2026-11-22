import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

// Cobre a correção do bug #4 do brief de revisão: organizationMediaRoutes
// só validava OWNER/ADMIN no início da requisição (middleware), nunca de
// novo antes de publicar o MediaAsset — um envio real demora (processamento
// de imagem + gravação de 4 arquivos em disco), tempo o bastante para o
// vínculo ser revogado no meio do caminho. A correção reconfere o vínculo
// DENTRO da transação que marca publishedAt (ver organizationMediaRoutes.ts).
//
// Para simular a revogação exatamente na janela entre "arquivo gravado" e
// "publicado" sem depender de duas requisições reais correndo em paralelo
// (não determinístico), interceptamos writeImageFiles — o mesmo padrão já
// usado em document-integration-flow.test.ts para node:child_process — para
// revogar o vínculo logo depois que ela retorna, e antes que o handler
// chegue à revalidação.
const revokeHook = vi.hoisted(() => ({ after: null as null | (() => Promise<void>) }));
vi.mock('../src/services/mediaStorage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/mediaStorage.js')>();
  return {
    ...actual,
    writeImageFiles: async (...args: Parameters<typeof actual.writeImageFiles>) => {
      const result = await actual.writeImageFiles(...args);
      if (revokeHook.after) await revokeHook.after();
      return result;
    },
  };
});

let server: Server; let base: string; let directory: string;
let ownerId: string; let ownerToken: string; let orgA: string;
const jpeg = (color = '#112233') => sharp({ create: { width: 300, height: 200, channels: 3, background: color } }).jpeg().toBuffer();

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'org-media-revoke-'));
  vi.stubEnv('UPLOADS_DIR', directory);
  const owner = await prisma.user.create({ data: { email: `org-media-revoke-owner:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  orgA = (await prisma.organization.create({ data: { name: 'Agência Revogação', slug: `org-media-revoke-${Date.now()}` } })).id;
  await prisma.membership.create({ data: { organizationId: orgA, userId: ownerId, role: 'OWNER' } });
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterEach(async () => {
  revokeHook.after = null;
  // Garante que a próxima it() comece com o vínculo ativo, mesmo se o
  // teste anterior revogou e a asserção falhar antes de restaurar.
  await prisma.membership.updateMany({ where: { organizationId: orgA, userId: ownerId }, data: { status: 'ACTIVE' } });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.mediaAsset.deleteMany({ where: { createdById: ownerId } });
  await prisma.membership.deleteMany({ where: { userId: ownerId } });
  await prisma.organization.deleteMany({ where: { id: orgA } });
  await prisma.user.deleteMany({ where: { id: ownerId } });
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe('POST /api/organizations/:organizationId/tourism/media — revogação no meio do envio', () => {
  it('revogado DEPOIS do arquivo gravado mas ANTES de publicar: nunca publica, remove o registro pendente e os arquivos já escritos', async () => {
    const input = await jpeg('#aa11bb');
    revokeHook.after = async () => {
      await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'REVOKED' } });
    };

    const response = await fetch(`${base}/${orgA}/tourism/media`, { method: 'POST', headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'image/jpeg' }, body: input });
    expect(response.status).toBe(403);

    // Nunca publicado: o registro pendente foi apagado, não só deixado
    // sem publishedAt (ver limpeza em organizationMediaRoutes.ts).
    const row = await prisma.mediaAsset.findFirst({ where: { organizationId: orgA, createdById: ownerId } });
    expect(row).toBeNull();

    // Os arquivos já gravados em disco (principal + variantes webp) também
    // foram removidos — nunca ficam órfãos sem registro correspondente.
    expect(await readdir(directory)).toHaveLength(0);
  });

  it('sem revogação, a mesma foto é publicada normalmente (controle: a interceptação em si não altera o fluxo)', async () => {
    const input = await jpeg('#bb22cc');
    const response = await fetch(`${base}/${orgA}/tourism/media`, { method: 'POST', headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'image/jpeg' }, body: input });
    expect(response.status).toBe(201);
    const asset = await response.json() as { id: string };
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(row.publishedAt).not.toBeNull();
    expect(await readdir(directory)).not.toHaveLength(0);
  });
});
