import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { tripCreateSchema } from '../src/validators/index.js';

describe('validação de coordenadas (zod)', () => {
  const minimal = {
    category: 'Teste',
    description: 'Descrição',
    city: 'Cidade',
    region: 'PB',
    startDateISO: '2030-01-10T09:00:00-03:00',
    includes: [],
    media: [],
  };

  it('aceita meetingLat/meetingLng dentro do intervalo válido', () => {
    const parsed = tripCreateSchema.parse({ ...minimal, title: 'A', meetingLat: -7.23, meetingLng: -35.89 });
    expect(parsed.meetingLat).toBe(-7.23);
    expect(parsed.meetingLng).toBe(-35.89);
  });

  it('aceita null (sem coordenada) e omissão', () => {
    expect(tripCreateSchema.parse({ ...minimal, title: 'A', meetingLat: null, meetingLng: null }).meetingLat).toBeNull();
    expect(tripCreateSchema.parse({ ...minimal, title: 'A' }).meetingLat).toBeUndefined();
  });

  it('rejeita latitude/longitude fora do intervalo', () => {
    expect(() => tripCreateSchema.parse({ ...minimal, title: 'A', meetingLat: 91, meetingLng: 0 })).toThrow();
    expect(() => tripCreateSchema.parse({ ...minimal, title: 'A', meetingLat: 0, meetingLng: 181 })).toThrow();
    expect(() => tripCreateSchema.parse({ ...minimal, title: 'A', meetingLat: -91, meetingLng: 0 })).toThrow();
    expect(() => tripCreateSchema.parse({ ...minimal, title: 'A', meetingLat: 0, meetingLng: -181 })).toThrow();
  });

  it('valida lat/lng de cada ponto de embarque', () => {
    const ok = tripCreateSchema.parse({
      ...minimal, title: 'A',
      departures: [{ time: '06h', place: 'Praça', city: 'CG', lat: -7.2, lng: -35.9, orderIndex: 0 }],
    });
    expect(ok.departures?.[0].lat).toBe(-7.2);

    expect(() => tripCreateSchema.parse({
      ...minimal, title: 'A',
      departures: [{ time: '06h', place: 'Praça', city: 'CG', lat: 1000, lng: -35.9, orderIndex: 0 }],
    })).toThrow();
  });
});

const prisma = new PrismaClient();
const TAG = `trip-coords-http:${Date.now()}`;

let server: Server;
let baseUrl: string;
let token: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const user = await prisma.user.create({
    data: { email: `${TAG}@example.com`, passwordHash: 'unused-in-this-test', role: 'admin', legacyAccess: true },
  });
  token = generateToken(user);
});

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { email: `${TAG}@example.com` } });
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('persistência de coordenadas confirmadas via API administrativa', () => {
  it('cria e devolve meetingLat/meetingLng e lat/lng de cada embarque', async () => {
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: `${TAG} criação`,
        category: 'Teste', description: 'Descrição', city: 'Campina Grande', region: 'PB',
        startDateISO: '2030-05-10T09:00:00-03:00',
        intensityClass: 'moderado', includes: [], media: [],
        storedIdentity: `${TAG}:create`,
        meetingTBD: false,
        meetingLat: -7.2159, meetingLng: -35.8814,
        departures: [{ time: '06h00', place: 'Praça da Bandeira', city: 'Campina Grande', lat: -7.21, lng: -35.88, orderIndex: 0 }],
      }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.meetingLat).toBeCloseTo(-7.2159);
    expect(created.meetingLng).toBeCloseTo(-35.8814);
    expect(created.departures[0].lat).toBeCloseTo(-7.21);
    expect(created.departures[0].lng).toBeCloseTo(-35.88);

    const getRes = await fetch(`${baseUrl}/api/trips/${created.id}`, { headers: { Authorization: `Bearer ${token}` } });
    const fetched = await getRes.json();
    expect(fetched.meetingLat).toBeCloseTo(-7.2159);
    expect(fetched.departures[0].lng).toBeCloseTo(-35.88);
  });

  it('rejeita coordenada fora do intervalo com 400', async () => {
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: `${TAG} inválida`,
        category: 'Teste', description: 'Descrição', city: 'Campina Grande', region: 'PB',
        startDateISO: '2030-05-11T09:00:00-03:00',
        intensityClass: 'moderado', includes: [], media: [],
        storedIdentity: `${TAG}:invalid`,
        meetingLat: 500, meetingLng: 0,
      }),
    });
    expect(res.status).toBe(400);
  });

  it('viagem antiga sem coordenadas continua sem os campos preenchidos', async () => {
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: `${TAG} legado`,
        category: 'Teste', description: 'Descrição', city: 'Campina Grande', region: 'PB',
        startDateISO: '2030-05-12T09:00:00-03:00',
        intensityClass: 'moderado', includes: [], media: [],
        storedIdentity: `${TAG}:legacy`,
        meetingCity: 'Campina Grande', meetingPoint: 'Praça da Bandeira',
      }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.meetingLat).toBeNull();
    expect(created.meetingLng).toBeNull();
  });
});
