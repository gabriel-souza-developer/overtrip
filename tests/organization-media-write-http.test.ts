import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { vi } from 'vitest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

// Cobre a primeira escrita de MÍDIA no escopo de empresa: envio de foto
// isolado por organizationId, e a criação de destinos visitados e de
// memórias da galeria que referenciam essas fotos. Garante que uma empresa
// nunca reaproveita a imagem de outra, nem edita um registro importado do
// acervo legado.

let server: Server; let base: string; let directory: string;
let ownerId: string; let ownerToken: string;
let memberId: string; let memberToken: string;
let orgA: string; let orgB: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const jpeg = (color = '#112233') => sharp({ create: { width: 300, height: 200, channels: 3, background: color } }).jpeg().toBuffer();

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'org-media-write-'));
  vi.stubEnv('UPLOADS_DIR', directory);
  const owner = await prisma.user.create({ data: { email: `org-media-write-owner:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  const member = await prisma.user.create({ data: { email: `org-media-write-member:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  memberId = member.id; memberToken = generateToken(member);
  orgA = (await prisma.organization.create({ data: { name: 'Agência Mídia A', slug: `org-media-write-a-${Date.now()}` } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência Mídia B', slug: `org-media-write-b-${Date.now()}` } })).id;
  await prisma.membership.create({ data: { organizationId: orgA, userId: ownerId, role: 'OWNER' } });
  await prisma.membership.create({ data: { organizationId: orgA, userId: memberId, role: 'MEMBER' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId: ownerId, role: 'OWNER' } });
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.galleryEntry.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.visit.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.mediaAsset.deleteMany({ where: { createdById: { in: [ownerId, memberId] } } });
  await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, memberId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

const upload = async (orgId: string, token: string, body: Buffer) =>
  fetch(`${base}/${orgId}/tourism/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' }, body });

describe('POST /api/organizations/:organizationId/tourism/media', () => {
  it('OWNER envia e recebe src público e previewSrc próprio; MEMBER é recusado', async () => {
    const response = await upload(orgA, ownerToken, await jpeg());
    expect(response.status).toBe(201);
    const asset = await response.json() as { src: string; previewSrc: string };
    expect(asset.src).toMatch(/^\/api\/public\/media\//);
    expect(asset.previewSrc).toContain(`/organizations/${orgA}/tourism/media/`);
    expect((await upload(orgA, memberToken, await jpeg())).status).toBe(403);
  });

  it('sem sessão é 401', async () => {
    const response = await fetch(`${base}/${orgA}/tourism/media`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: await jpeg() });
    expect(response.status).toBe(401);
  });
});

describe('fotos de destinos e galeria ficam isoladas por empresa', () => {
  it('cria destino com foto própria; recusa foto de outra empresa; só edita o que foi criado manualmente', async () => {
    const uploaded = await (await upload(orgA, ownerToken, await jpeg('#aabbcc'))).json() as { src: string };
    const uploadedB = await (await upload(orgB, ownerToken, await jpeg('#ccbbaa'))).json() as { src: string };

    // MEMBER não cria.
    const deniedCreate = await fetch(`${base}/${orgA}/tourism/visits`, { method: 'POST', headers: auth(memberToken), body: JSON.stringify({ title: 'Praia Nova', city: 'João Pessoa', region: 'PB' }) });
    expect(deniedCreate.status).toBe(403);

    // Foto de outra empresa é recusada.
    const crossBody = JSON.stringify({ title: 'Praia Nova', city: 'João Pessoa', region: 'PB', images: [{ src: uploadedB.src, alt: 'Foto' }] });
    const crossResponse = await fetch(`${base}/${orgA}/tourism/visits`, { method: 'POST', headers: auth(ownerToken), body: crossBody });
    expect(crossResponse.status).toBe(400);

    // Criação própria funciona e a foto é servida pela rota da própria empresa.
    const created = await fetch(`${base}/${orgA}/tourism/visits`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ title: 'Praia Nova', city: 'João Pessoa', region: 'PB', lat: -7.1, lng: -34.8, images: [{ src: uploaded.src, alt: 'Vista da praia' }] }) });
    expect(created.status).toBe(201);
    const visit = await created.json() as { id: string; images: Array<{ src: string; previewSrc: string }>; canEdit: boolean; updatedAt: string };
    expect(visit.canEdit).toBe(true);
    // `src` fica canônico (o que assertOwnedImages exige ao reenviar); a rota
    // própria da empresa é só `previewSrc` (ver organizationOwnedMedia.ts).
    expect(visit.images[0]?.src).toMatch(/^\/api\/public\/media\//);
    expect(visit.images[0]?.previewSrc).toContain(`/organizations/${orgA}/tourism/visits/media/`);

    // Outra empresa não vê nem edita este destino.
    expect((await fetch(`${base}/${orgB}/tourism/visits/${visit.id}`, { headers: auth(ownerToken) })).status).toBe(404);
    const crossEdit = await fetch(`${base}/${orgB}/tourism/visits/${visit.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ title: 'Invasão', expectedUpdatedAt: visit.updatedAt }) });
    expect(crossEdit.status).toBe(404);

    // Edição legítima funciona com concorrência otimista.
    const edited = await fetch(`${base}/${orgA}/tourism/visits/${visit.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ title: 'Praia Nova (revisada)', expectedUpdatedAt: visit.updatedAt }) });
    expect(edited.status).toBe(200);
    expect((await edited.json() as { title: string }).title).toBe('Praia Nova (revisada)');

    // Um destino importado do acervo legado (source != 'manual') nunca é editável aqui.
    const legacy = await prisma.visit.create({ data: { organizationId: orgA, title: 'Destino legado', city: 'Recife', region: 'PE', storedIdentity: `org-media-write-legacy-${Date.now()}`, source: 'visited_places_hardcoded' } });
    const legacyEdit = await fetch(`${base}/${orgA}/tourism/visits/${legacy.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ title: 'Tentativa', expectedUpdatedAt: new Date(0).toISOString() }) });
    expect(legacyEdit.status).toBe(404);
    const legacyRead = await (await fetch(`${base}/${orgA}/tourism/visits/${legacy.id}`, { headers: auth(ownerToken) })).json() as { canEdit: boolean };
    expect(legacyRead.canEdit).toBe(false);
  });

  it('cria memória da galeria exigindo ao menos uma foto própria', async () => {
    const uploaded = await (await upload(orgA, ownerToken, await jpeg('#113355'))).json() as { src: string };
    const noImages = await fetch(`${base}/${orgA}/tourism/gallery`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ title: 'Memória', date: '2030-01-01T12:00:00.000Z', dateDisplay: 'Janeiro de 2030', description: 'Teste', images: [] }) });
    expect(noImages.status).toBe(400);

    const created = await fetch(`${base}/${orgA}/tourism/gallery`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ title: 'Memória', date: '2030-01-01T12:00:00.000Z', dateDisplay: 'Janeiro de 2030', description: 'Teste', images: [{ src: uploaded.src, alt: 'Grupo na trilha' }] }) });
    expect(created.status).toBe(201);
    const entry = await created.json() as { id: string; images: Array<{ src: string; previewSrc: string }>; canEdit: boolean };
    expect(entry.canEdit).toBe(true);
    expect(entry.images[0]?.src).toMatch(/^\/api\/public\/media\//);
    expect(entry.images[0]?.previewSrc).toContain(`/organizations/${orgA}/tourism/gallery/media/`);

    expect((await fetch(`${base}/${orgB}/tourism/gallery/${entry.id}`, { headers: auth(ownerToken) })).status).toBe(404);
  });
});
