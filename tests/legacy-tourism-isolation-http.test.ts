import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { config } from '../src/config.js';
import { normalizeForSearch } from '../src/utils/searchUtils.js';

const prisma = new PrismaClient();
const TAG = `legacy-isolation-test:${Date.now()}`;

let server: Server;
let baseUrl: string;
let token: string;
let userId: string;
let orgAId: string;
let orgBId: string;
let tripLegacyId: string;
let tripOrgAId: string;
let tripOrgBId: string;

const authed = (extra: RequestInit = {}) => ({ ...extra, headers: { Authorization: `Bearer ${token}`, ...(extra.headers || {}) } });
const json = (method: string, body: unknown) => ({
  method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

const makeTrip = (organizationId: string | null, label: string) => prisma.trip.create({
  data: {
    organizationId,
    title: `${TAG}:${label}`,
    titleSearch: normalizeForSearch(`${TAG}:${label}`),
    category: 'Teste',
    categorySearch: normalizeForSearch('Teste'),
    description: 'Descrição completa da experiência de teste.',
    city: 'Cidade',
    citySearch: normalizeForSearch('Cidade'),
    region: 'PB',
    startDateISO: new Date('2026-12-01T06:00:00-03:00'),
    intensityClass: 'moderado',
    includes: JSON.stringify([]),
    priceValue: 100,
    meetingTBD: true,
    media: JSON.stringify([{ src: 'https://example.com/isolation.jpg', alt: 'Foto da viagem' }]),
    storedIdentity: `${TAG}:${label}`,
  },
});

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const user = await prisma.user.create({
    data: { legacyAccess: true, email: `test:${TAG}@example.com`, passwordHash: 'unused-in-this-test', role: 'admin' },
  });
  userId = user.id;
  token = generateToken(user);

  const orgA = await prisma.organization.create({ data: { name: `${TAG}:A`, slug: `${TAG}-a` } });
  const orgB = await prisma.organization.create({ data: { name: `${TAG}:B`, slug: `${TAG}-b` } });
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [tripLegacy, tripOrgA, tripOrgB] = await Promise.all([
    makeTrip(null, 'legacy'),
    makeTrip(orgAId, 'org-a'),
    makeTrip(orgBId, 'org-b'),
  ]);
  tripLegacyId = tripLegacy.id;
  tripOrgAId = tripOrgA.id;
  tripOrgBId = tripOrgB.id;
});

afterAll(async () => {
  config.legacyTourismOrganizationId = null;
  await prisma.visit.deleteMany({ where: { storedIdentity: { startsWith: `${TAG}:` } } });
  await prisma.galleryEntry.deleteMany({ where: { storedIdentity: { startsWith: `${TAG}:` } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: `${TAG}:` } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('isolamento legado de viagens (operador legado vs. organizações)', () => {
  it('lista só viagens do escopo legado (organizationId null), nunca de outra empresa', async () => {
    const list = await (await fetch(`${baseUrl}/api/trips?search=${encodeURIComponent(TAG)}`, authed())).json() as { data: Array<{ id: string }> };
    const ids = list.data.map((t) => t.id);
    expect(ids).toContain(tripLegacyId);
    expect(ids).not.toContain(tripOrgAId);
    expect(ids).not.toContain(tripOrgBId);
  });

  it('detalhe: 200 para viagem legada, 404 para viagem de outra empresa', async () => {
    expect((await fetch(`${baseUrl}/api/trips/${tripLegacyId}`, authed())).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/trips/${tripOrgAId}`, authed())).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/trips/${tripOrgBId}`, authed())).status).toBe(404);
  });

  it('PUT em viagem de outra empresa retorna 404 e não altera o registro', async () => {
    const res = await fetch(`${baseUrl}/api/trips/${tripOrgAId}`, json('PUT', { title: 'Sequestrada pelo operador legado' }));
    expect(res.status).toBe(404);
    const after = await prisma.trip.findUniqueOrThrow({ where: { id: tripOrgAId } });
    expect(after.title).toBe(`${TAG}:org-a`);
  });

  it('publish/unpublish em viagem de outra empresa retorna 404', async () => {
    expect((await fetch(`${baseUrl}/api/trips/${tripOrgAId}/publish`, authed({ method: 'POST' }))).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/trips/${tripOrgBId}/unpublish`, authed({ method: 'POST' }))).status).toBe(404);
    const after = await prisma.trip.findUniqueOrThrow({ where: { id: tripOrgAId } });
    expect(after.status).toBe('DRAFT');
  });

  it('DELETE em viagem de outra empresa retorna 404 e não a exclui', async () => {
    const res = await fetch(`${baseUrl}/api/trips/${tripOrgBId}`, authed({ method: 'DELETE' }));
    expect(res.status).toBe(404);
    expect(await prisma.trip.findUnique({ where: { id: tripOrgBId } })).not.toBeNull();
  });

  it('POST (criação) ignora organizationId enviado no corpo; a viagem nasce no escopo legado padrão', async () => {
    const storedIdentity = `${TAG}:created-ignoring-org`;
    const res = await fetch(`${baseUrl}/api/trips`, json('POST', {
      title: 'Criada pelo operador legado', category: 'Teste', description: 'Descrição completa.',
      city: 'Cidade', region: 'PB', startDateISO: '2026-12-01T06:00:00-03:00', intensityClass: 'moderado',
      meetingTBD: true, storedIdentity, organizationId: orgAId,
    }));
    expect(res.status).toBe(201);
    const created = await res.json();
    const row = await prisma.trip.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.organizationId).toBeNull();
    await prisma.trip.delete({ where: { id: created.id } });
  });

  it('documentos por tripId: 404 (lista e upload) quando a viagem é de outra empresa', async () => {
    const docsUrl = `${baseUrl}/api/trips/${tripOrgAId}/documents`;
    expect((await fetch(docsUrl, authed())).status).toBe(404);
    const upload = await fetch(docsUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf', 'X-Document-Filename': 'roteiro.pdf' },
      body: '%PDF-1.7\nfixture',
    });
    expect(upload.status).toBe(404);
  });

  it('dashboard: contagem de viagens cresce só com a viagem do escopo legado', async () => {
    const before = await (await fetch(`${baseUrl}/api/dashboard/stats`, authed())).json() as { tripsTotal: number };
    const extra = await makeTrip(null, 'dashboard-extra');
    const after = await (await fetch(`${baseUrl}/api/dashboard/stats`, authed())).json() as { tripsTotal: number };
    expect(after.tripsTotal).toBe(before.tripsTotal + 1);
    await prisma.trip.delete({ where: { id: extra.id } });
  });

  it('visitas: associar a uma viagem de outra empresa falha como se ela não existisse', async () => {
    const storedIdentity = `${TAG}:visit`;
    const foreign = await fetch(`${baseUrl}/api/visits`, json('POST', {
      title: 'Visita teste', city: 'Cidade', region: 'PB', tripId: tripOrgAId, storedIdentity,
    }));
    expect(foreign.status).toBe(400);
    expect((await foreign.json()).error).toContain('Viagem referenciada não existe');

    const ok = await fetch(`${baseUrl}/api/visits`, json('POST', {
      title: 'Visita teste', city: 'Cidade', region: 'PB', tripId: tripLegacyId, storedIdentity,
    }));
    expect(ok.status).toBe(201);
    const visit = await ok.json();

    const updateForeign = await fetch(`${baseUrl}/api/visits/${visit.id}`, json('PUT', { tripId: tripOrgBId }));
    expect(updateForeign.status).toBe(400);

    const associateForeign = await fetch(`${baseUrl}/api/visits/${visit.id}/associate`, json('POST', { tripId: tripOrgAId }));
    expect(associateForeign.status).toBe(400);

    await prisma.visit.delete({ where: { id: visit.id } });
  });

  it('galeria: associar a uma viagem de outra empresa falha como se ela não existisse', async () => {
    const storedIdentity = `${TAG}:gallery`;
    const image = [{ src: 'https://example.com/gallery.jpg', alt: 'Foto' }];
    const foreign = await fetch(`${baseUrl}/api/gallery`, json('POST', {
      title: 'Memória teste', date: '2026-12-01T06:00:00-03:00', dateDisplay: '01/12/2026',
      description: 'Descrição.', images: image, tripId: tripOrgAId, storedIdentity,
    }));
    expect(foreign.status).toBe(400);
    expect((await foreign.json()).error).toContain('Viagem referenciada não existe');

    const ok = await fetch(`${baseUrl}/api/gallery`, json('POST', {
      title: 'Memória teste', date: '2026-12-01T06:00:00-03:00', dateDisplay: '01/12/2026',
      description: 'Descrição.', images: image, tripId: tripLegacyId, storedIdentity,
    }));
    expect(ok.status).toBe(201);
    const entry = await ok.json();

    const updateForeign = await fetch(`${baseUrl}/api/gallery/${entry.id}`, json('PUT', { tripId: tripOrgBId }));
    expect(updateForeign.status).toBe(400);

    await prisma.galleryEntry.delete({ where: { id: entry.id } });
  });
});

describe('isolamento legado com LEGACY_TOURISM_ORGANIZATION_ID configurado', () => {
  it('passa a incluir só a organização configurada, nunca as demais', async () => {
    config.legacyTourismOrganizationId = orgAId;
    try {
      const list = await (await fetch(`${baseUrl}/api/trips?search=${encodeURIComponent(TAG)}`, authed())).json() as { data: Array<{ id: string }> };
      const ids = list.data.map((t) => t.id);
      expect(ids).toContain(tripLegacyId);
      expect(ids).toContain(tripOrgAId);
      expect(ids).not.toContain(tripOrgBId);

      expect((await fetch(`${baseUrl}/api/trips/${tripOrgAId}`, authed())).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/trips/${tripOrgBId}`, authed())).status).toBe(404);

      expect((await fetch(`${baseUrl}/api/trips/${tripOrgAId}/documents`, authed())).status).toBe(200);
    } finally {
      config.legacyTourismOrganizationId = null;
    }
  });
});
