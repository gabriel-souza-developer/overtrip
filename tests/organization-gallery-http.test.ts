import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server; let base: string; let userId: string; let token: string; let orgA: string; let orgB: string; let directory: string;
const ownKey = 'a'.repeat(32); const foreignKey = 'b'.repeat(32); const orphanKey = 'c'.repeat(32);
const identities = ['org-gallery-own', 'org-gallery-foreign-image', 'org-gallery-orphan', 'org-gallery-b', 'org-gallery-cross'];
const headers = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'org-gallery-')); vi.stubEnv('UPLOADS_DIR', directory);
  const user = await prisma.user.create({ data: { email: 'org-gallery-member@example.test', passwordHash: 'unused', role: 'editor' } });
  userId = user.id; token = generateToken(user);
  orgA = (await prisma.organization.create({ data: { name: 'Agência A', slug: 'org-gallery-a' } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência B', slug: 'org-gallery-b' } })).id;
  await prisma.membership.create({ data: { userId, organizationId: orgA, role: 'MEMBER' } });
  for (const [key, organizationId] of [[ownKey, orgA], [foreignKey, orgB]]) {
    await writeFile(join(directory, `${key}.jpg`), 'teste');
    await prisma.mediaAsset.create({ data: { storageKey: key, path: `/api/public/media/${key}.jpg`, organizationId, mimeType: 'image/jpeg', width: 1, height: 1, sizeBytes: 5, originalBytes: 5, sha256: key, createdById: userId, publishedAt: new Date() } });
  }
  await writeFile(join(directory, `${orphanKey}.jpg`), 'teste');
  const foreignTrip = await prisma.trip.create({ data: { organizationId: orgB, title: 'Viagem estrangeira', category: 'Teste', description: 'privado', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'leve', includes: '[]', media: '[]', storedIdentity: 'org-gallery-trip-b' } });
  const foreignVisit = await prisma.visit.create({ data: { organizationId: orgA, tripId: foreignTrip.id, title: 'Visita cruzada', city: 'Cidade', region: 'PB', storedIdentity: 'org-gallery-cross-visit' } });
  const common = { date: new Date('2030-01-01T12:00:00Z'), dateDisplay: 'Janeiro de 2030', description: 'Memória de teste', orderIndex: 1 };
  for (const [identity, title, organizationId, key, visitId] of [
    [identities[0], 'Memória própria', orgA, ownKey, null], [identities[1], 'Imagem estrangeira', orgA, foreignKey, null],
    [identities[2], 'Imagem sem registro', orgA, orphanKey, null], [identities[3], 'Memória estrangeira', orgB, foreignKey, null],
    [identities[4], 'Vínculo cruzado', orgA, ownKey, foreignVisit.id],
  ]) await prisma.galleryEntry.create({ data: { ...common, title: title!, titleSearch: title!.toLowerCase(), organizationId, images: JSON.stringify([{ src: `/api/public/media/${key}.jpg`, alt: 'Foto' }]), storedIdentity: identity!, visitId } });
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.galleryEntry.deleteMany({ where: { storedIdentity: { in: identities } } });
  await prisma.visit.deleteMany({ where: { storedIdentity: 'org-gallery-cross-visit' } });
  await prisma.trip.deleteMany({ where: { storedIdentity: 'org-gallery-trip-b' } });
  await prisma.mediaAsset.deleteMany({ where: { createdById: userId } });
  await prisma.membership.deleteMany({ where: { userId } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true });
});

describe('galeria isolada por empresa', () => {
  it('exige sessão, permite membro e não entrega referências desconhecidas, estrangeiras ou cruzadas', async () => {
    expect((await fetch(`${base}/${orgA}/tourism/gallery`)).status).toBe(401);
    const response = await fetch(`${base}/${orgA}/tourism/gallery`, { headers: headers() });
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json() as { data: Array<{ title: string; images: Array<{ src: string; previewSrc: string }> }>; pagination: { total: number } };
    expect(body.pagination.total).toBe(3);
    expect(body.data.map(entry => entry.title)).not.toContain('Memória estrangeira');
    expect(body.data.map(entry => entry.title)).not.toContain('Vínculo cruzado');
    const own = body.data.find(entry => entry.title === 'Memória própria')?.images[0];
    expect(own?.src).toBe(`/api/public/media/${ownKey}.jpg`);
    expect(own?.previewSrc).toContain(`/gallery/media/${ownKey}.jpg`);
    expect(body.data.find(entry => entry.title === 'Imagem estrangeira')?.images).toEqual([]);
    expect(body.data.find(entry => entry.title === 'Imagem sem registro')?.images).toEqual([]);
    expect(JSON.stringify(body)).not.toContain(foreignKey); expect(JSON.stringify(body)).not.toContain(orphanKey);
    const search = await (await fetch(`${base}/${orgA}/tourism/gallery?search=estrangeira`, { headers: headers() })).json() as { pagination: { total: number } };
    expect(search.pagination.total).toBe(1);
  });
  it('nega acesso direto a arquivo de outra empresa ou órfão e revalida revogação', async () => {
    expect((await fetch(`${base}/${orgA}/tourism/gallery/media/${ownKey}.jpg`, { headers: headers() })).status).toBe(200);
    expect((await fetch(`${base}/${orgA}/tourism/gallery/media/${foreignKey}.jpg`, { headers: headers() })).status).toBe(404);
    expect((await fetch(`${base}/${orgA}/tourism/gallery/media/${orphanKey}.jpg`, { headers: headers() })).status).toBe(404);
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId } }, data: { status: 'REVOKED' } });
    expect((await fetch(`${base}/${orgA}/tourism/gallery/media/${ownKey}.jpg`, { headers: headers() })).status).toBe(403);
  });
});
