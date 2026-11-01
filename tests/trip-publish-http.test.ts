import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';

const prisma = new PrismaClient();

let server: Server;
let baseUrl: string;
let token: string;
let userId: string;
let tripId: string;
let nonAdminToken: string;
let nonAdminUserId: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const user = await prisma.user.create({
    data: {
      email: `test:trip-publish-http:${Date.now()}@example.com`,
      passwordHash: 'unused-in-this-test',
      role: 'admin',
    },
  });
  userId = user.id;
  token = generateToken({ id: user.id, email: user.email, role: user.role });

  const nonAdminUser = await prisma.user.create({
    data: {
      email: `test:trip-publish-http:non-admin:${Date.now()}@example.com`,
      passwordHash: 'unused-in-this-test',
      role: 'editor',
    },
  });
  nonAdminUserId = nonAdminUser.id;
  nonAdminToken = generateToken({ id: nonAdminUser.id, email: nonAdminUser.email, role: nonAdminUser.role });

  const trip = await prisma.trip.create({
    data: {
      title: 'Trip Publish HTTP Test',
      category: 'Test',
      description: 'Test',
      city: 'City',
      region: 'PB',
      startDateISO: new Date('2026-12-01T06:00:00-03:00'),
      intensityClass: 'moderado',
      includes: JSON.stringify([]),
      priceValue: 100,
      media: JSON.stringify([{ src: 'https://example.com/publish.jpg', alt: 'Foto da viagem' }]),
      storedIdentity: `publish-http-test:${Date.now()}`,
    },
  });
  tripId = trip.id;
});

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: 'publish-http-test:' } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.user.delete({ where: { id: nonAdminUserId } }).catch(() => {});
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('POST /api/trips/:id/publish e /:id/unpublish (HTTP real)', () => {
  it('publica uma viagem com id válido', async () => {
    const res = await fetch(`${baseUrl}/api/trips/${tripId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(tripId);
    expect(body.status).toBe('OPEN');
    expect(body.publishedAt).toBeTruthy();
  });

  it('despublica uma viagem com id válido', async () => {
    const openTrip = await prisma.trip.create({
      data: {
        title: 'Trip Publish HTTP Test (unpublish)',
        category: 'Test',
        description: 'Test',
        city: 'City',
        region: 'PB',
        startDateISO: new Date('2026-12-01T06:00:00-03:00'),
        intensityClass: 'moderado',
        includes: JSON.stringify([]),
        media: JSON.stringify([]),
        status: 'OPEN',
        storedIdentity: `publish-http-test:unpublish:${Date.now()}`,
      },
    });

    const res = await fetch(`${baseUrl}/api/trips/${openTrip.id}/unpublish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(openTrip.id);
    expect(body.status).toBe('DRAFT');
  });

  it('retorna 404 formatado para publish com id inexistente, sem travar o servidor', async () => {
    const res = await fetch(`${baseUrl}/api/trips/id-inexistente-123/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');

    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
  });

  it('retorna 404 formatado para unpublish com id inexistente, sem travar o servidor', async () => {
    const res = await fetch(`${baseUrl}/api/trips/id-inexistente-123/unpublish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');

    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
  });

  it('exige token de autenticação para publicar', async () => {
    const res = await fetch(`${baseUrl}/api/trips/${tripId}/publish`, {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it('exige token de autenticação para despublicar', async () => {
    const res = await fetch(`${baseUrl}/api/trips/${tripId}/unpublish`, {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it('retorna 403 ao publicar com usuário autenticado sem role admin', async () => {
    const res = await fetch(`${baseUrl}/api/trips/${tripId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${nonAdminToken}` },
    });
    expect(res.status).toBe(403);
  });

  it('retorna 403 ao despublicar com usuário autenticado sem role admin', async () => {
    const res = await fetch(`${baseUrl}/api/trips/${tripId}/unpublish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${nonAdminToken}` },
    });
    expect(res.status).toBe(403);
  });

  it('recusa publicar sem foto ou valor, mesmo pela API', async () => {
    const invalidTrip = await prisma.trip.create({
      data: {
        title: 'Trip sem dados de publicação', category: 'Test', description: 'Test', city: 'City', region: 'PB',
        startDateISO: new Date('2026-12-01T06:00:00-03:00'), intensityClass: 'moderado',
        includes: JSON.stringify([]), media: JSON.stringify([]),
        storedIdentity: `publish-http-test:invalid:${Date.now()}`,
      },
    });

    const res = await fetch(`${baseUrl}/api/trips/${invalidTrip.id}/publish`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.error).toContain('pelo menos uma foto');
    expect(body.error).toContain('viagem como gratuita');
  });
});

describe('bypass de status via POST/PUT /api/trips (HTTP real)', () => {
  const basePayload = (extra: Record<string, unknown> = {}) => ({
    title: 'Trip Status Bypass',
    category: 'Test',
    description: 'Test',
    city: 'City',
    region: 'PB',
    startDateISO: '2026-12-01T06:00:00-03:00',
    intensityClass: 'moderado',
    storedIdentity: `publish-http-test:bypass:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    ...extra,
  });

  const send = (method: string, path: string, tk: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const makeTrip = (status: 'DRAFT' | 'OPEN') =>
    prisma.trip.create({
      data: {
        title: 'Trip Status Bypass (seed)',
        category: 'Test',
        description: 'Test',
        city: 'City',
        region: 'PB',
        startDateISO: new Date('2026-12-01T06:00:00-03:00'),
        intensityClass: 'moderado',
        includes: JSON.stringify([]),
        media: JSON.stringify([]),
        status,
        storedIdentity: `publish-http-test:bypass-seed:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      },
    });

  it('POST de não-admin com status OPEN responde 403 e não cria a viagem', async () => {
    const payload = basePayload({ status: 'OPEN' });
    const res = await send('POST', '/api/trips', nonAdminToken, payload);
    expect(res.status).toBe(403);
    const found = await prisma.trip.findUnique({ where: { storedIdentity: payload.storedIdentity } });
    expect(found).toBeNull();
  });

  it('POST de não-admin sem status ou com DRAFT cria como DRAFT', async () => {
    const res1 = await send('POST', '/api/trips', nonAdminToken, basePayload());
    expect(res1.status).toBe(201);
    expect((await res1.json()).status).toBe('DRAFT');
    const res2 = await send('POST', '/api/trips', nonAdminToken, basePayload({ status: 'DRAFT' }));
    expect(res2.status).toBe(201);
  });

  it('POST de admin com status OPEN segue funcionando', async () => {
    const res = await send('POST', '/api/trips', token, basePayload({
      status: 'OPEN', priceValue: 100,
      media: [{ src: 'https://example.com/publish.jpg', alt: 'Foto da viagem' }],
    }));
    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe('OPEN');
  });

  it('PUT de não-admin mudando o status responde 403 e não altera a viagem', async () => {
    const trip = await makeTrip('DRAFT');
    const res = await send('PUT', `/api/trips/${trip.id}`, nonAdminToken, { status: 'OPEN' });
    expect(res.status).toBe(403);
    const after = await prisma.trip.findUnique({ where: { id: trip.id } });
    expect(after?.status).toBe('DRAFT');
  });

  it('PUT de não-admin não consegue despublicar nem fechar viagem OPEN', async () => {
    const trip = await makeTrip('OPEN');
    const res = await send('PUT', `/api/trips/${trip.id}`, nonAdminToken, { status: 'DRAFT' });
    expect(res.status).toBe(403);
    const after = await prisma.trip.findUnique({ where: { id: trip.id } });
    expect(after?.status).toBe('OPEN');
  });

  it('PUT de não-admin reenviando o mesmo status passa', async () => {
    const trip = await makeTrip('OPEN');
    const res = await send('PUT', `/api/trips/${trip.id}`, nonAdminToken, { title: 'Novo título', status: 'OPEN' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('Novo título');
    expect(body.status).toBe('OPEN');
  });

  it('PUT de não-admin sem o campo status passa', async () => {
    const trip = await makeTrip('DRAFT');
    const res = await send('PUT', `/api/trips/${trip.id}`, nonAdminToken, { title: 'Outro título' });
    expect(res.status).toBe(200);
  });

  it('PUT de admin mudando o status segue funcionando', async () => {
    const trip = await makeTrip('DRAFT');
    const res = await send('PUT', `/api/trips/${trip.id}`, token, {
      status: 'OPEN', priceValue: 100,
      media: [{ src: 'https://example.com/publish.jpg', alt: 'Foto da viagem' }],
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('OPEN');
  });

  it('PUT de admin não abre viagem sem foto ou valor', async () => {
    const trip = await makeTrip('DRAFT');
    const res = await send('PUT', `/api/trips/${trip.id}`, token, { status: 'OPEN' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('BAD_REQUEST');
  });
});
