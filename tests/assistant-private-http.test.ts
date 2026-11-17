import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAssistantPrivateApp } from '../src/assistantPrivateApp.js';
import { prisma } from '../src/lib/prisma.js';

const secret = 'ab'.repeat(32);
let server: Server; let url: string;
beforeAll(async () => { await new Promise<void>(resolve => { server = createAssistantPrivateApp(secret).listen(0, '127.0.0.1', resolve); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); });
describe('catálogo privado do conector', () => {
  it('restringe acesso e não permite escrita', async () => {
    expect((await fetch(`${url}/catalog`)).status).toBe(401);
    expect((await fetch(`${url}/catalog`, { headers: { authorization: `Bearer ${'cd'.repeat(32)}` } })).status).toBe(401);
    const headers = { authorization: `Bearer ${secret}` };
    const response = await fetch(`${url}/catalog`, { headers });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Array.isArray((await response.json()).trips)).toBe(true);
    expect((await fetch(`${url}/knowledge`, { headers })).status).toBe(200);
    expect((await fetch(`${url}/catalog`, { method: 'POST', headers })).status).toBe(404);
  });
});

describe('isolamento por empresa no catálogo e nas rotas n8n', () => {
  const TAG = `assistant-org-isolation-test:${Date.now()}`;
  const headers = { authorization: `Bearer ${secret}` };
  let organizationId: string;

  beforeAll(async () => {
    const organization = await prisma.organization.create({ data: { name: TAG, slug: TAG } });
    organizationId = organization.id;
    await prisma.trip.create({
      data: {
        organizationId,
        title: TAG,
        category: 'Teste',
        description: 'Descrição completa da experiência.',
        city: 'Cidade',
        region: 'PB',
        intensityClass: 'moderado',
        includes: JSON.stringify(['Item A']),
        media: JSON.stringify([{ src: 'assets/images/a.jpg', alt: 'Alt' }]),
        status: 'OPEN',
        free: true,
        meetingTBD: true,
        startDateISO: new Date('2030-01-01T09:00:00-03:00'),
        storedIdentity: `${TAG}:trip`,
      },
    });
  });

  afterAll(async () => {
    await prisma.trip.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  });

  it('não recomenda viagem de outra empresa no catálogo nem nas rotas n8n, por padrão', async () => {
    const catalog = await (await fetch(`${url}/catalog`, { headers })).json() as { trips: { title: string }[] };
    expect(catalog.trips.map((t) => t.title)).not.toContain(TAG);

    const n8nTrips = await (await fetch(`${url}/n8n/trips`, { headers })).json() as { title: string }[];
    expect(n8nTrips.map((t) => t.title)).not.toContain(TAG);

    const n8nV2Trips = await (await fetch(`${url}/n8n/v2/trips`, { headers })).json() as { title: string }[];
    expect(n8nV2Trips.map((t) => t.title)).not.toContain(TAG);
  });
});
