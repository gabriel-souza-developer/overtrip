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

// Cobre a paridade de Redes sociais por empresa (SocialMedia/SocialPost com
// organizationId): titularidade em cada consulta e escrita, papel
// revalidado, concorrência otimista (campo version, herdado da rota
// legada), acesso cruzado entre empresas e revogação de vínculo no meio de
// um envio de imagem. Registros do acervo legado (organizationId nulo)
// nunca aparecem aqui.

const revokeHook = vi.hoisted(() => ({ after: null as null | (() => Promise<void>) }));
vi.mock('../src/services/mediaProcessing.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/mediaProcessing.js')>();
  return {
    ...actual,
    processImage: async (...args: Parameters<typeof actual.processImage>) => {
      const result = await actual.processImage(...args);
      if (revokeHook.after) await revokeHook.after();
      return result;
    },
  };
});

let server: Server; let base: string; let directory: string;
let ownerId: string; let ownerToken: string;
let memberId: string; let memberToken: string;
let orgA: string; let orgB: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const jpeg = (color = '#112233') => sharp({ create: { width: 300, height: 200, channels: 3, background: color } }).jpeg().toBuffer();
const upload = async (orgId: string, token: string, body: Buffer) =>
  fetch(`${base}/${orgId}/tourism/social-media`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' }, body });

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'org-social-media-'));
  vi.stubEnv('SOCIAL_MEDIA_DIR', directory);
  const owner = await prisma.user.create({ data: { email: `org-social-owner:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  const member = await prisma.user.create({ data: { email: `org-social-member:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  memberId = member.id; memberToken = generateToken(member);
  orgA = (await prisma.organization.create({ data: { name: 'Agência Social A', slug: `org-social-a-${Date.now()}` } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência Social B', slug: `org-social-b-${Date.now()}` } })).id;
  await prisma.membership.create({ data: { organizationId: orgA, userId: ownerId, role: 'OWNER' } });
  await prisma.membership.create({ data: { organizationId: orgA, userId: memberId, role: 'MEMBER' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId: ownerId, role: 'OWNER' } });
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterEach(async () => {
  revokeHook.after = null;
  await prisma.membership.updateMany({ where: { organizationId: orgA, userId: ownerId }, data: { status: 'ACTIVE' } });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.socialPostVariant.deleteMany({ where: { post: { organizationId: { in: [orgA, orgB] } } } });
  await prisma.socialPost.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.socialMedia.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, memberId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe('POST /api/organizations/:organizationId/tourism/social-media', () => {
  it('OWNER envia e lê a própria imagem; MEMBER é recusado tanto para enviar quanto para ler (igual a Interessados/Reservas)', async () => {
    const response = await upload(orgA, ownerToken, await jpeg());
    expect(response.status).toBe(201);
    const asset = await response.json() as { id: string };
    expect((await upload(orgA, memberToken, await jpeg())).status).toBe(403);
    const read = await fetch(`${base}/${orgA}/tourism/social-media/${asset.id}`, { headers: auth(memberToken) });
    expect(read.status).toBe(403);
    const ownerRead = await fetch(`${base}/${orgA}/tourism/social-media/${asset.id}`, { headers: auth(ownerToken) });
    expect(ownerRead.status).toBe(200);
  });

  it('sem sessão é 401; sem vínculo com a empresa é 403', async () => {
    expect((await fetch(`${base}/${orgA}/tourism/social-media`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: await jpeg() })).status).toBe(401);
    const stranger = await prisma.user.create({ data: { email: `org-social-stranger:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
    const strangerToken = generateToken(stranger);
    expect((await upload(orgA, strangerToken, await jpeg())).status).toBe(403);
    await prisma.user.delete({ where: { id: stranger.id } });
  });

  it('empresa A nunca lê a mídia social de B, mesmo sendo OWNER de ambas', async () => {
    const uploadedB = await (await upload(orgB, ownerToken, await jpeg('#ccbbaa'))).json() as { id: string };
    expect((await fetch(`${base}/${orgA}/tourism/social-media/${uploadedB.id}`, { headers: auth(ownerToken) })).status).toBe(404);
  });

  it('revogado DEPOIS do processamento mas ANTES de gravar no banco: nunca cria o registro e remove o arquivo já escrito', async () => {
    revokeHook.after = async () => {
      await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'REVOKED' } });
    };
    const filesBefore = await readdir(directory);
    const countBefore = await prisma.socialMedia.count({ where: { organizationId: orgA } });
    const response = await upload(orgA, ownerToken, await jpeg('#aa11bb'));
    expect(response.status).toBe(403);
    expect(await prisma.socialMedia.count({ where: { organizationId: orgA } })).toBe(countBefore);
    expect(await readdir(directory)).toHaveLength(filesBefore.length);
  });
});

describe('CRUD de rascunhos sociais por empresa', () => {
  it('OWNER cria, edita e aprova; MEMBER não lê nem escreve (informação de divulgação, igual a Interessados/Reservas); concorrência otimista recusa versão desatualizada', async () => {
    const media = await (await upload(orgA, ownerToken, await jpeg('#113355'))).json() as { id: string };
    const deniedCreate = await fetch(`${base}/${orgA}/tourism/social-posts`, { method: 'POST', headers: auth(memberToken), body: JSON.stringify({ title: 'Post', variants: [{ platform: 'INSTAGRAM', caption: 'Olá', socialMediaId: media.id }] }) });
    expect(deniedCreate.status).toBe(403);

    const created = await fetch(`${base}/${orgA}/tourism/social-posts`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ title: 'Post', variants: [{ platform: 'INSTAGRAM', caption: 'Olá', socialMediaId: media.id }] }) });
    expect(created.status).toBe(201);
    const post = await created.json() as { id: string; version: number };

    expect((await fetch(`${base}/${orgA}/tourism/social-posts/${post.id}`, { headers: auth(memberToken) })).status).toBe(403);
    expect((await fetch(`${base}/${orgA}/tourism/social-posts`, { headers: auth(memberToken) })).status).toBe(403);
    expect((await fetch(`${base}/${orgA}/tourism/social-posts/${post.id}`, { headers: auth(ownerToken) })).status).toBe(200);

    const staleEdit = await fetch(`${base}/${orgA}/tourism/social-posts/${post.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ title: 'Mudou', version: post.version + 99, variants: [{ platform: 'INSTAGRAM', caption: 'Olá', socialMediaId: media.id }] }) });
    expect(staleEdit.status).toBe(409);

    const approved = await fetch(`${base}/${orgA}/tourism/social-posts/${post.id}/approve`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ version: post.version }) });
    expect(approved.status).toBe(200);
    const after = await approved.json() as { version: number; approvedAt: string | null };
    expect(after.approvedAt).not.toBeNull();

    const edited = await fetch(`${base}/${orgA}/tourism/social-posts/${post.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ title: 'Revisado', version: after.version, variants: [{ platform: 'INSTAGRAM', caption: 'Olá revisado', socialMediaId: media.id }] }) });
    expect(edited.status).toBe(200);
    expect((await edited.json() as { approvedAt: string | null }).approvedAt).toBeNull();

    const deniedDelete = await fetch(`${base}/${orgA}/tourism/social-posts/${post.id}`, { method: 'DELETE', headers: auth(memberToken), body: JSON.stringify({ version: after.version + 1 }) });
    expect(deniedDelete.status).toBe(403);
  });

  it('não vincula imagem de outra empresa a um rascunho', async () => {
    const mediaB = await (await upload(orgB, ownerToken, await jpeg('#aabbcc'))).json() as { id: string };
    const response = await fetch(`${base}/${orgA}/tourism/social-posts`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ title: 'Post cruzado', variants: [{ platform: 'FACEBOOK', caption: 'Teste', socialMediaId: mediaB.id }] }) });
    expect(response.status).toBe(400);
  });

  it('empresa B nunca lista, lê, aprova ou exclui rascunho de A', async () => {
    const media = await (await upload(orgA, ownerToken, await jpeg('#334455'))).json() as { id: string };
    const created = await fetch(`${base}/${orgA}/tourism/social-posts`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ title: 'Isolado', variants: [{ platform: 'TIKTOK', caption: 'Teste', socialMediaId: media.id }] }) });
    const post = await created.json() as { id: string; version: number };

    const list = await (await fetch(`${base}/${orgB}/tourism/social-posts`, { headers: auth(ownerToken) })).json() as { data: Array<{ id: string }> };
    expect(list.data.find((item) => item.id === post.id)).toBeUndefined();

    expect((await fetch(`${base}/${orgB}/tourism/social-posts/${post.id}`, { headers: auth(ownerToken) })).status).toBe(404);
    expect((await fetch(`${base}/${orgB}/tourism/social-posts/${post.id}/approve`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ version: post.version }) })).status).toBe(404);
    expect((await fetch(`${base}/${orgB}/tourism/social-posts/${post.id}`, { method: 'DELETE', headers: auth(ownerToken), body: JSON.stringify({ version: post.version }) })).status).toBe(404);

    // Ainda existe e continua acessível pela própria empresa.
    expect((await fetch(`${base}/${orgA}/tourism/social-posts/${post.id}`, { headers: auth(ownerToken) })).status).toBe(200);
  });

  it('rascunho legado (organizationId nulo) fica invisível nas rotas por empresa', async () => {
    const legacyMedia = await prisma.socialMedia.create({ data: { storageKey: 'ffffffffffffffffffffffffffffffff.jpg', sha256: 'legacy', mimeType: 'image/jpeg', width: 10, height: 10, sizeBytes: 10, createdById: ownerId } });
    const legacyPost = await prisma.socialPost.create({ data: { title: 'Legado', variants: { create: [{ platform: 'INSTAGRAM', caption: 'Legado', socialMediaId: legacyMedia.id }] } } });
    expect((await fetch(`${base}/${orgA}/tourism/social-posts/${legacyPost.id}`, { headers: auth(ownerToken) })).status).toBe(404);
    expect((await fetch(`${base}/${orgA}/tourism/social-media/${legacyMedia.id}`, { headers: auth(ownerToken) })).status).toBe(404);
    await prisma.socialPostVariant.deleteMany({ where: { postId: legacyPost.id } });
    await prisma.socialPost.delete({ where: { id: legacyPost.id } });
    await prisma.socialMedia.delete({ where: { id: legacyMedia.id } });
  });
});
