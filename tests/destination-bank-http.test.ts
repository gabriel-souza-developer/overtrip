import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { config } from '../src/config.js';

// Banco privado de destinos (/api/destinations): só administradores do
// painel OVERTRIP, escopo legado (null + LEGACY_TOURISM_ORGANIZATION_ID),
// links só http(s), concorrência otimista e totais das saídas calculados.

const prisma = new PrismaClient();
const TAG = `destination-bank-test:${Date.now()}`;
let server: Server;
let baseUrl: string;
let adminToken: string;
let userToken: string;
let noLegacyToken: string;
let orgId: string;
let foreignId: string;
const userIds: string[] = [];

const call = (path: string, token: string | null, method = 'GET', body?: unknown) => fetch(`${baseUrl}/api/destinations${path}`, {
  method,
  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
  body: body !== undefined ? JSON.stringify(body) : undefined,
});

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const make = async (suffix: string, role: string, legacyAccess: boolean) => {
    const user = await prisma.user.create({ data: { email: `test:${TAG}:${suffix}@example.com`, passwordHash: 'unused', role, legacyAccess } });
    userIds.push(user.id);
    return generateToken(user);
  };
  adminToken = await make('admin', 'admin', true);
  userToken = await make('user', 'user', true);
  noLegacyToken = await make('nolegacy', 'admin', false);
  const org = await prisma.organization.create({ data: { name: `${TAG}:org`, slug: `${TAG}-org` } });
  orgId = org.id;
  foreignId = (await prisma.destination.create({ data: { name: `${TAG}:estrangeiro`, organizationId: orgId, nameSearch: 'estrangeiro' } })).id;
});

afterAll(async () => {
  config.legacyTourismOrganizationId = null;
  await prisma.visit.deleteMany({ where: { storedIdentity: { startsWith: TAG } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: TAG } } });
  await prisma.destination.deleteMany({ where: { OR: [{ name: { startsWith: TAG } }, { organizationId: orgId }] } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('banco de destinos', () => {
  it('exige sessão, acesso ao painel OVERTRIP e papel de administrador', async () => {
    expect((await call('/', null)).status).toBe(401);
    expect((await call('/', noLegacyToken)).status).toBe(403);
    expect((await call('/', userToken)).status).toBe(403);
    const response = await call('/', adminToken);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('cria, edita com versão, registra saídas e calcula os totais', async () => {
    const created = await call('/', adminToken, 'POST', {
      name: `${TAG}:Cachoeira Teste`, city: 'Pilões', region: 'PB', category: 'Cachoeira', distanceKm: 78, trailLevel: 'MODERATE',
      links: [{ label: 'Google Maps', url: 'https://maps.app.goo.gl/exemplo' }],
    });
    expect(created.status).toBe(201);
    const destination = await created.json();
    expect(destination).toMatchObject({ status: 'IDEA', imported: false, links: [{ label: 'Google Maps' }], summary: { outingsCount: 0 } });
    expect(destination).not.toHaveProperty('organizationId');
    expect(destination).not.toHaveProperty('nameSearch');

    const stale = await call(`/${destination.id}`, adminToken, 'PUT', { status: 'PRIORITY', expectedUpdatedAt: new Date(0).toISOString() });
    expect(stale.status).toBe(409);
    const updated = await (await call(`/${destination.id}`, adminToken, 'PUT', { status: 'PRIORITY', bestSeason: 'Inverno', expectedUpdatedAt: destination.updatedAt })).json();
    expect(updated).toMatchObject({ status: 'PRIORITY', bestSeason: 'Inverno' });

    const withOuting = await call(`/${destination.id}/outings`, adminToken, 'POST', {
      date: '2024-09-29', passengers: 21, pricePerPersonCents: 6500, transportCostCents: 60000, extraCostCents: 15000, supplier: 'Transporte X',
    });
    expect(withOuting.status).toBe(201);
    const body = await withOuting.json();
    expect(body.outings[0]).toMatchObject({ revenueCents: 136500, expenseCents: 75000, resultCents: 61500, supplier: 'Transporte X' });
    expect(body.summary).toMatchObject({ outingsCount: 1, averageResultCents: 61500, lastOutingDate: '2024-09-29T12:00:00.000Z' });
    expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(new Date(updated.updatedAt).getTime());

    const visited = await (await call(`/?visited=true&search=${encodeURIComponent('cachoeira teste')}`, adminToken)).json();
    expect(visited.data.map((row: { id: string }) => row.id)).toContain(destination.id);
    const notVisited = await (await call('/?visited=false', adminToken)).json();
    expect(notVisited.data.map((row: { id: string }) => row.id)).not.toContain(destination.id);

    const outingId = body.outings[0].id;
    const edited = await (await call(`/${destination.id}/outings/${outingId}`, adminToken, 'PUT', { passengers: null })).json();
    expect(edited.outings[0]).toMatchObject({ revenueCents: null, resultCents: null, expenseCents: 75000 });
    expect((await call(`/${destination.id}/outings/${outingId}`, adminToken, 'DELETE')).status).toBe(200);
    expect((await call(`/${destination.id}`, adminToken, 'DELETE')).status).toBe(204);
    expect((await call(`/${destination.id}`, adminToken)).status).toBe(404);
  });

  it('recusa links que não sejam http(s) e campos desconhecidos', async () => {
    expect((await call('/', adminToken, 'POST', { name: `${TAG}:x`, links: [{ label: 'X', url: 'javascript:alert(1)' }] })).status).toBe(400);
    expect((await call('/', adminToken, 'POST', { name: `${TAG}:x`, organizationId: orgId })).status).toBe(400);
    expect((await call('/', adminToken, 'POST', { name: `${TAG}:x`, trailLevel: 'EXTREME' })).status).toBe(400);
  });

  it('nunca expõe nem altera destino de outra empresa fora do escopo legado', async () => {
    const list = await (await call('/?limit=100', adminToken)).json();
    expect(list.data.map((row: { id: string }) => row.id)).not.toContain(foreignId);
    expect((await call(`/${foreignId}`, adminToken)).status).toBe(404);
    expect((await call(`/${foreignId}/outings`, adminToken, 'POST', { passengers: 1 })).status).toBe(404);
    expect((await call(`/${foreignId}`, adminToken, 'DELETE')).status).toBe(404);
    expect(await prisma.destination.count({ where: { id: foreignId } })).toBe(1);

    config.legacyTourismOrganizationId = orgId;
    try {
      expect((await call(`/${foreignId}`, adminToken)).status).toBe(200);
    } finally {
      config.legacyTourismOrganizationId = null;
    }
  });

  it('não aparece no mapa público de destinos (que vem de Visitas)', async () => {
    const created = await call('/', adminToken, 'POST', { name: `${TAG}:privado`, city: 'Cidade', region: 'PB', notes: 'Nota interna' });
    expect(created.status).toBe(201);
    const response = await fetch(`${baseUrl}/api/public/destinations`);
    expect(await response.text()).not.toContain(TAG);
  });

  it('sincroniza com o site: vincula, completa campos vazios, cria saídas passadas e não mexe no que já foi ligado', async () => {
    const makeTrip = (key: string, title: string, startDateISO: string, extra: Record<string, unknown> = {}) => prisma.trip.create({ data: {
      title, category: 'Teste', description: 'Descrição do site.', city: 'Pilões', region: 'PB', startDateISO: new Date(startDateISO), intensityClass: 'moderado',
      includes: '[]', media: '[]', priceValue: 65, status: 'COMPLETED', storedIdentity: `${TAG}:${key}`, ...extra,
    } });
    const makeVisit = (key: string, title: string, date: string | null, extra: Record<string, unknown> = {}) => prisma.visit.create({ data: {
      title, city: 'Pilões', region: 'PB', date: date ? new Date(date) : null, lat: -6.8, lng: -35.6, needsReview: false, storedIdentity: `${TAG}:${key}`, ...extra,
    } });

    const base = await (await call('/', adminToken, 'POST', { name: `${TAG} Cachoeira Sinc` })).json();
    await call(`/${base.id}/outings`, adminToken, 'POST', { date: '2024-09-29', passengers: 20 });
    const manual = await (await call('/', adminToken, 'POST', { name: `${TAG} Outro lugar` })).json();

    const visit = await makeVisit('v1', `Camping - ${TAG} Cachoeira Sinc - PB`, '2024-09-29T12:00:00.000Z');
    const trip = await makeTrip('t1', `OVER RIDERS: ${TAG} CACHOEIRA SINC - PB`, '2024-09-29T03:30:00-03:00');
    const newPlace = await makeVisit('v2', `${TAG} Lugar Novo`, '2025-01-10T12:00:00.000Z', { city: 'Areia' });
    const future = await makeTrip('t2', `${TAG} Praia Futura - PB`, '2099-01-10T06:00:00-03:00', { status: 'OPEN' });
    const draft = await makeTrip('t3', `${TAG} Cachoeira Sinc`, '2024-01-01T06:00:00-03:00', { status: 'DRAFT' });
    const preLinked = await makeVisit('v3', `${TAG} Cachoeira Sinc`, null, { destinationId: manual.id });
    const foreign = await makeVisit('v4', `${TAG} Cachoeira Sinc`, '2024-09-29T12:00:00.000Z', { organizationId: orgId });

    const first = await call('/sync-site', adminToken, 'POST');
    expect(first.status).toBe(200);
    const report = await first.json();
    expect(report.linkedVisits).toBeGreaterThanOrEqual(2);
    expect(report.linkedTrips).toBeGreaterThanOrEqual(2);

    const links = await prisma.visit.findMany({ where: { id: { in: [visit.id, newPlace.id, preLinked.id, foreign.id] } }, select: { id: true, destinationId: true } });
    const linkOf = (id: string) => links.find((row) => row.id === id)!.destinationId;
    expect(linkOf(visit.id)).toBe(base.id);
    expect(linkOf(preLinked.id)).toBe(manual.id);
    expect(linkOf(foreign.id)).toBeNull();
    expect((await prisma.trip.findUnique({ where: { id: trip.id } }))!.destinationId).toBe(base.id);
    expect((await prisma.trip.findUnique({ where: { id: draft.id } }))!.destinationId).toBeNull();

    const synced = await (await call(`/${base.id}`, adminToken)).json();
    expect(synced).toMatchObject({ city: 'Pilões', region: 'PB', category: 'Cachoeira', trailLevel: 'MODERATE' });
    expect(synced.links).toEqual([{ label: 'Google Maps', url: 'https://www.google.com/maps?q=-6.8,-35.6' }]);
    expect(synced.outings).toHaveLength(1);
    expect(synced.outings[0]).toMatchObject({ date: '2024-09-29T12:00:00.000Z', passengers: 20, pricePerPersonCents: 6500, onSite: true });
    expect(synced.site.onMap).toBe(true);
    expect(synced.site.visits).toMatchObject([{ id: visit.id, date: '2024-09-29', onMap: true }]);
    expect(synced.site.trips).toMatchObject([{ id: trip.id, date: '2024-09-29', status: 'COMPLETED', pricePerPersonCents: 6500, description: 'Descrição do site.' }]);

    const createdId = (await prisma.visit.findUnique({ where: { id: newPlace.id } }))!.destinationId!;
    const created = await (await call(`/${createdId}`, adminToken)).json();
    expect(created).toMatchObject({ name: `${TAG} Lugar Novo`, city: 'Areia', region: 'PB', imported: false, summary: { outingsCount: 1 } });
    const futureId = (await prisma.trip.findUnique({ where: { id: future.id } }))!.destinationId!;
    const futureDestination = await (await call(`/${futureId}`, adminToken)).json();
    expect(futureDestination.outings).toEqual([]);
    expect(futureDestination.site.trips).toHaveLength(1);

    const onMap = await (await call(`/?onMap=true&search=${encodeURIComponent(TAG)}&limit=100`, adminToken)).json();
    expect(onMap.data.map((row: { id: string }) => row.id)).toContain(base.id);
    const offMap = await (await call(`/?onMap=false&search=${encodeURIComponent(TAG)}&limit=100`, adminToken)).json();
    expect(offMap.data.map((row: { id: string }) => row.id)).not.toContain(base.id);

    // Mesma data não junta lugares diferentes; dia vizinho (acampamento) não duplica a saída.
    const camp = await (await call('/', adminToken, 'POST', { name: `${TAG} Rio Camping` })).json();
    await call(`/${camp.id}/outings`, adminToken, 'POST', { date: '2023-07-23' });
    await makeVisit('v5', `Camping no ${TAG} Rio Camping`, '2023-07-22T12:00:00.000Z');
    await makeVisit('v6', `${TAG} Dique`, '2026-08-15T12:00:00.000Z');
    await makeVisit('v7', `${TAG} Fortaleza`, '2026-08-15T12:00:00.000Z');
    // Visita e viagem do mesmo dia, ambas novas: a saída já sai com o valor da viagem na primeira execução.
    await makeVisit('v8', `${TAG} Trilha Nova`, '2026-10-18T12:00:00.000Z');
    await makeTrip('t4', `${TAG} TRILHA NOVA - PB`, '2026-10-18T00:00:00.000Z', { priceValue: 109.99 });
    const third = await (await call('/sync-site', adminToken, 'POST')).json();
    expect(third).toMatchObject({ linkedVisits: 4, linkedTrips: 1, createdDestinations: 3 });
    expect(await (await call('/sync-site', adminToken, 'POST')).json()).toEqual({ linkedVisits: 0, linkedTrips: 0, createdDestinations: 0, createdOutings: 0, filledFields: 0 });
    const trilha = (await (await call(`/?search=${encodeURIComponent('trilha nova')}`, adminToken)).json()).data[0];
    expect(trilha.outings).toMatchObject([{ date: '2026-10-18T12:00:00.000Z', pricePerPersonCents: 10999 }]);
    const campAfter = await (await call(`/${camp.id}`, adminToken)).json();
    expect(campAfter.outings).toHaveLength(1);
    expect(campAfter.outings[0].onSite).toBe(true);

    const second = await (await call('/sync-site', adminToken, 'POST')).json();
    expect(second).toEqual({ linkedVisits: 0, linkedTrips: 0, createdDestinations: 0, createdOutings: 0, filledFields: 0 });
    expect((await call('/sync-site', userToken, 'POST')).status).toBe(403);
  });
});
