import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server, base: string;
let orgA: string, orgB: string, ownerId: string, memberId: string, outsiderId: string;
let ownerToken: string, memberToken: string, outsiderToken: string;
const prefix = `visit-gallery-delete-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const url = (org: string, resource: 'visits' | 'gallery', id: string) => `${base}/${org}/tourism/${resource}/${id}`;
const del = (org: string, resource: 'visits' | 'gallery', id: string, token?: string) => fetch(url(org, resource, id), { method: 'DELETE', headers: token ? auth(token) : {} });
let seq = 0;
async function visit(org: string | null, source = 'manual') {
  return prisma.visit.create({ data: { organizationId: org, source, title: 'Destino teste', city: 'Areia', region: 'PB', storedIdentity: `${prefix}:visit:${seq++}` } });
}
async function gallery(org: string | null, source = 'manual', visitId?: string, images = '[]') {
  return prisma.galleryEntry.create({ data: { organizationId: org, source, visitId, title: 'Memória teste', description: 'teste', date: new Date(), dateDisplay: 'hoje', orderIndex: 0, images, storedIdentity: `${prefix}:gallery:${seq++}` } });
}
beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: `${prefix}-owner@example.test`, passwordHash: 'test', role: 'editor' } });
  const member = await prisma.user.create({ data: { email: `${prefix}-member@example.test`, passwordHash: 'test', role: 'editor' } });
  const outsider = await prisma.user.create({ data: { email: `${prefix}-other@example.test`, passwordHash: 'test', role: 'editor' } });
  ownerId = owner.id; memberId = member.id; outsiderId = outsider.id;
  ownerToken = generateToken(owner); memberToken = generateToken(member); outsiderToken = generateToken(outsider);
  orgA = (await prisma.organization.create({ data: { name: 'A', slug: `${prefix}-a` } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'B', slug: `${prefix}-b` } })).id;
  await prisma.membership.createMany({ data: [
    { organizationId: orgA, userId: ownerId, role: 'OWNER' },
    { organizationId: orgA, userId: memberId, role: 'MEMBER' },
    { organizationId: orgB, userId: outsiderId, role: 'OWNER' },
  ] });
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.galleryEntry.deleteMany({ where: { storedIdentity: { startsWith: `${prefix}:` } } });
  await prisma.visit.deleteMany({ where: { storedIdentity: { startsWith: `${prefix}:` } } });
  await prisma.mediaAsset.deleteMany({ where: { storageKey: { startsWith: prefix } } });
  await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, memberId, outsiderId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId, outsiderId] } } });
  await prisma.$disconnect();
});

describe.each(['visits', 'gallery'] as const)('DELETE de %s por empresa', resource => {
  const create = (org: string | null, source = 'manual') => resource === 'visits' ? visit(org, source) : gallery(org, source);
  const find = (id: string) => resource === 'visits' ? prisma.visit.findUnique({ where: { id } }) : prisma.galleryEntry.findUnique({ where: { id } });
  it('exige sessão e papel de escrita, preservando o registro', async () => {
    const item = await create(orgA);
    expect((await del(orgA, resource, item.id)).status).toBe(401);
    expect((await del(orgA, resource, item.id, memberToken)).status).toBe(403);
    expect(await find(item.id)).not.toBeNull();
  });
  it('bloqueia outra empresa e não revela id estrangeiro', async () => {
    const item = await create(orgA);
    expect((await del(orgA, resource, item.id, outsiderToken)).status).toBe(403);
    expect((await del(orgB, resource, item.id, outsiderToken)).status).toBe(404);
    expect(await find(item.id)).not.toBeNull();
  });
  it('protege acervo importado e legado mesmo para OWNER', async () => {
    const imported = await create(orgA, 'gallery_hardcoded');
    const legacy = await create(null, 'manual');
    expect((await del(orgA, resource, imported.id, ownerToken)).status).toBe(404);
    expect((await del(orgA, resource, legacy.id, ownerToken)).status).toBe(404);
    expect(await find(imported.id)).not.toBeNull(); expect(await find(legacy.id)).not.toBeNull();
  });
  it('OWNER exclui registro próprio e repetição devolve 404', async () => {
    const item = await create(orgA);
    expect((await del(orgA, resource, item.id, ownerToken)).status).toBe(204);
    expect(await find(item.id)).toBeNull();
    expect((await del(orgA, resource, item.id, ownerToken)).status).toBe(404);
  });
  it('requisições concorrentes não excluem mais de uma vez', async () => {
    const item = await create(orgA);
    const results = await Promise.all([del(orgA, resource, item.id, ownerToken), del(orgA, resource, item.id, ownerToken)]);
    expect(results.map(result => result.status).sort()).toEqual([204, 404]);
    expect(await find(item.id)).toBeNull();
  });
  it('vínculo revogado impede exclusão imediatamente', async () => {
    const item = await create(orgA);
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'INACTIVE' } });
    try { expect((await del(orgA, resource, item.id, ownerToken)).status).toBe(403); expect(await find(item.id)).not.toBeNull(); }
    finally { await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'ACTIVE' } }); }
  });
});

describe('registros ocultos com vínculos inconsistentes', () => {
  it('nega leitura, edição e exclusão de destino e memória ligados a viagem de outra empresa', async () => {
    const trip = await prisma.trip.create({ data: {
      organizationId: orgB, title: 'Viagem estrangeira', category: 'Teste', description: 'Teste', city: 'Areia', region: 'PB',
      intensityClass: 'leve', includes: '[]', media: '[]', startDateISO: new Date('2030-01-01T00:00:00.000Z'),
      storedIdentity: `${prefix}:foreign-trip`,
    } });
    const destination = await visit(orgA);
    const memory = await gallery(orgA);
    await prisma.visit.update({ where: { id: destination.id }, data: { tripId: trip.id } });
    await prisma.galleryEntry.update({ where: { id: memory.id }, data: { tripId: trip.id } });
    try {
      for (const [resource, record] of [['visits', destination], ['gallery', memory]] as const) {
        const endpoint = url(orgA, resource, record.id);
        expect((await fetch(endpoint, { headers: auth(ownerToken) })).status).toBe(404);
        const edit = await fetch(endpoint, { method: 'PUT', headers: { ...auth(ownerToken), 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Alteração indevida', expectedUpdatedAt: record.updatedAt.toISOString() }) });
        expect(edit.status).toBe(404);
        expect((await del(orgA, resource, record.id, ownerToken)).status).toBe(404);
      }
      expect((await prisma.visit.findUniqueOrThrow({ where: { id: destination.id } })).title).toBe('Destino teste');
      expect((await prisma.galleryEntry.findUniqueOrThrow({ where: { id: memory.id } })).title).toBe('Memória teste');
    } finally {
      await prisma.galleryEntry.deleteMany({ where: { id: memory.id } });
      await prisma.visit.deleteMany({ where: { id: destination.id } });
      await prisma.trip.delete({ where: { id: trip.id } });
    }
  });
  it('nega leitura, edição e exclusão de memória ligada a destino de outra empresa', async () => {
    const foreignVisit = await visit(orgB);
    const memory = await gallery(orgA, 'manual', foreignVisit.id);
    const endpoint = url(orgA, 'gallery', memory.id);
    expect((await fetch(endpoint, { headers: auth(ownerToken) })).status).toBe(404);
    expect((await fetch(endpoint, { method: 'PUT', headers: { ...auth(ownerToken), 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Alteração indevida', expectedUpdatedAt: memory.updatedAt.toISOString() }) })).status).toBe(404);
    expect((await del(orgA, 'gallery', memory.id, ownerToken)).status).toBe(404);
    expect((await prisma.galleryEntry.findUniqueOrThrow({ where: { id: memory.id } })).title).toBe('Memória teste');
  });
});

describe('integridade de vínculos e mídia', () => {
  it('impede excluir destino referenciado por memória própria e estrangeira', async () => {
    const item = await visit(orgA); const own = await gallery(orgA, 'manual', item.id);
    expect((await del(orgA, 'visits', item.id, ownerToken)).status).toBe(400);
    await prisma.galleryEntry.delete({ where: { id: own.id } });
    const foreign = await gallery(orgB, 'manual', item.id);
    expect((await del(orgA, 'visits', item.id, ownerToken)).status).toBe(409);
    expect(await prisma.visit.findUnique({ where: { id: item.id } })).not.toBeNull();
    await prisma.galleryEntry.delete({ where: { id: foreign.id } });
    expect((await del(orgA, 'visits', item.id, ownerToken)).status).toBe(204);
  });
  it('excluir memória preserva mídia compartilhada e outro registro', async () => {
    const key = `${prefix}-image`;
    const asset = await prisma.mediaAsset.create({ data: { organizationId: orgA, storageKey: key, path: `${key}.jpg`, mimeType: 'image/jpeg', width: 1, height: 1, sizeBytes: 1, originalBytes: 1, sha256: key, createdById: ownerId, publishedAt: new Date() } });
    const images = JSON.stringify([{ src: `/api/public/media/${key}.jpg`, alt: 'Foto' }]);
    const first = await gallery(orgA, 'manual', undefined, images); const second = await gallery(orgA, 'manual', undefined, images);
    expect((await del(orgA, 'gallery', first.id, ownerToken)).status).toBe(204);
    expect(await prisma.mediaAsset.findUnique({ where: { id: asset.id } })).not.toBeNull();
    expect(await prisma.galleryEntry.findUnique({ where: { id: second.id } })).not.toBeNull();
  });
});
