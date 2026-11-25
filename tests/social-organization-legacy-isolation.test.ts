import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

// A revisão encontrou as rotas legadas (/api/social-posts, /api/social-media)
// sem filtro de organizationId: um administrador do painel legado (role
// "admin" + legacyAccess) conseguia listar, contar, ler, editar, aprovar,
// excluir e vincular imagem de QUALQUER empresa por ali. Este arquivo cobre
// a direção contrária à de organization-social-http.test.ts (que já cobria
// "empresa nunca vê o acervo legado"): aqui, o acervo legado nunca vê,
// conta, altera ou vincula o que pertence a uma empresa, mesmo sabendo o id
// e a versão corretos.

let server: Server; let legacyBase: string; let orgBase: string; let directory: string;
let adminId: string; let adminToken: string;
let ownerId: string; let ownerToken: string;
let orgId: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const jpeg = (color = '#654321') => sharp({ create: { width: 40, height: 30, channels: 3, background: color } }).jpeg().toBuffer();
const uploadOrgMedia = (body: Buffer) =>
  fetch(`${orgBase}/${orgId}/tourism/social-media`, { method: 'POST', headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'image/jpeg' }, body });

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'legacy-social-isolation-'));
  vi.stubEnv('SOCIAL_MEDIA_DIR', directory);
  const admin = await prisma.user.create({ data: { email: `legacy-social-admin:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin', legacyAccess: true } });
  adminId = admin.id; adminToken = generateToken(admin);
  const owner = await prisma.user.create({ data: { email: `legacy-social-owner:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  orgId = (await prisma.organization.create({ data: { name: 'Agência Isolamento Legado', slug: `legacy-isolation-${Date.now()}` } })).id;
  await prisma.membership.create({ data: { organizationId: orgId, userId: ownerId, role: 'OWNER' } });
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as AddressInfo).port;
  legacyBase = `http://127.0.0.1:${port}/api`;
  orgBase = `http://127.0.0.1:${port}/api/organizations`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.socialPostVariant.deleteMany({ where: { post: { organizationId: orgId } } });
  await prisma.socialPost.deleteMany({ where: { organizationId: orgId } });
  await prisma.socialMedia.deleteMany({ where: { organizationId: orgId } });
  await prisma.membership.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, ownerId] } } });
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe('rotas legadas de redes sociais nunca alcançam o que pertence a uma empresa', () => {
  it('listagem e contagem legadas não incluem o rascunho da empresa', async () => {
    const media = await (await uploadOrgMedia(await jpeg())).json() as { id: string };
    const createdOrgPost = await fetch(`${orgBase}/${orgId}/tourism/social-posts`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ title: 'Rascunho da empresa', variants: [{ platform: 'INSTAGRAM', caption: 'Olá', socialMediaId: media.id }] }) });
    expect(createdOrgPost.status).toBe(201);
    const orgPost = await createdOrgPost.json() as { id: string; version: number };

    const totalBefore = await prisma.socialPost.count({ where: { organizationId: null } });
    const list = await (await fetch(legacyBase + '/social-posts?limit=100', { headers: auth(adminToken) })).json() as { data: Array<{ id: string }>; pagination: { total: number } };
    expect(list.pagination.total).toBe(totalBefore);
    expect(list.data.find((item) => item.id === orgPost.id)).toBeUndefined();
  });

  it('leitura, edição, aprovação e exclusão legadas recusam o id do rascunho da empresa, que permanece intacto', async () => {
    const media = await (await uploadOrgMedia(await jpeg('#aa5500'))).json() as { id: string };
    const createdOrgPost = await fetch(`${orgBase}/${orgId}/tourism/social-posts`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ title: 'Intocável', variants: [{ platform: 'FACEBOOK', caption: 'Teste', socialMediaId: media.id }] }) });
    const orgPost = await createdOrgPost.json() as { id: string; version: number };

    expect((await fetch(`${legacyBase}/social-posts/${orgPost.id}`, { headers: auth(adminToken) })).status).toBe(404);
    expect((await fetch(`${legacyBase}/social-posts/${orgPost.id}`, { method: 'PUT', headers: auth(adminToken), body: JSON.stringify({ title: 'Sequestrado', version: orgPost.version, variants: [{ platform: 'FACEBOOK', caption: 'Alterado' }] }) })).status).toBe(404);
    expect((await fetch(`${legacyBase}/social-posts/${orgPost.id}/approve`, { method: 'POST', headers: auth(adminToken), body: JSON.stringify({ version: orgPost.version }) })).status).toBe(404);
    expect((await fetch(`${legacyBase}/social-posts/${orgPost.id}`, { method: 'DELETE', headers: auth(adminToken), body: JSON.stringify({ version: orgPost.version }) })).status).toBe(404);

    // Continua existindo, sem alterações, pela própria rota da empresa.
    const stillThere = await fetch(`${orgBase}/${orgId}/tourism/social-posts/${orgPost.id}`, { headers: auth(ownerToken) });
    expect(stillThere.status).toBe(200);
    const current = await stillThere.json() as { title: string; version: number; approvedAt: string | null };
    expect(current.title).toBe('Intocável');
    expect(current.version).toBe(orgPost.version);
    expect(current.approvedAt).toBeNull();
  });

  it('criação legada não vincula uma imagem que pertence a uma empresa', async () => {
    const media = await (await uploadOrgMedia(await jpeg('#0033aa'))).json() as { id: string };
    const response = await fetch(`${legacyBase}/social-posts`, { method: 'POST', headers: auth(adminToken), body: JSON.stringify({ title: 'Tentativa cruzada', variants: [{ platform: 'TIKTOK', caption: 'Teste', socialMediaId: media.id }] }) });
    expect(response.status).toBe(400);
  });

  it('leitura legada de mídia nunca serve o arquivo de uma empresa, mesmo sabendo o id', async () => {
    const media = await (await uploadOrgMedia(await jpeg('#113399'))).json() as { id: string };
    expect((await fetch(`${legacyBase}/social-media/${media.id}`, { headers: auth(adminToken) })).status).toBe(404);
    // Continua servida normalmente pela rota da própria empresa.
    expect((await fetch(`${orgBase}/${orgId}/tourism/social-media/${media.id}`, { headers: auth(ownerToken) })).status).toBe(200);
  });
});
