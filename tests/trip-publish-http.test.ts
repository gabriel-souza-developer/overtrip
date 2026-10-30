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
      media: JSON.stringify([]),
      storedIdentity: `publish-http-test:${Date.now()}`,
    },
  });
  tripId = trip.id;
});

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: 'publish-http-test:' } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
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
});
