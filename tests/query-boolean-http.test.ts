import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { queryBoolean } from '../src/validators/index.js';

const prisma = new PrismaClient();
const TAG = `qb-${Date.now()}`;

let server: Server;
let baseUrl: string;
let token: string;
let userId: string;

const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
};
const titles = (r: { json: { data: Array<{ title: string }> } }) => r.json.data.map((d) => d.title).sort();

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const user = await prisma.user.create({
    data: { email: `test:query-boolean:${Date.now()}@example.com`, passwordHash: 'unused', role: 'admin' },
  });
  userId = user.id;
  token = generateToken({ id: user.id, email: user.email, role: user.role });

  const visit = (suffix: string, extra: object) => call('POST', '/api/visits', { title: `${TAG}-${suffix}`, city: 'C', region: 'PB', ...extra });
  expect((await visit('pendente-mapa', { needsReview: true, lat: -7, lng: -36 })).status).toBe(201);
  expect((await visit('revisada-sem-mapa', { needsReview: false })).status).toBe(201);

  const gallery = (suffix: string, isFeatured: boolean) => call('POST', '/api/gallery', {
    title: `${TAG}-${suffix}`, date: '2026-01-01T00:00:00.000Z', dateDisplay: '1 de janeiro de 2026', description: 'd',
    images: [{ src: 'https://example.com/a.jpg', alt: 'a' }], isFeatured,
  });
  expect((await gallery('destaque', true)).status).toBe(201);
  expect((await gallery('comum', false)).status).toBe(201);
});

afterAll(async () => {
  await prisma.galleryEntry.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.visit.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('queryBoolean', () => {
  it('lê "false" como false e "true" como true', () => {
    expect(queryBoolean.parse('false')).toBe(false);
    expect(queryBoolean.parse('0')).toBe(false);
    expect(queryBoolean.parse('true')).toBe(true);
    expect(queryBoolean.parse('1')).toBe(true);
    expect(queryBoolean.parse(undefined)).toBeUndefined();
  });
  it('rejeita texto que não é verdadeiro nem falso', () => {
    expect(queryBoolean.safeParse('talvez').success).toBe(false);
  });
});

describe('filtros booleanos da API', () => {
  it('needsReview=false devolve só as revisadas; true só as pendentes', async () => {
    expect(titles(await call('GET', `/api/visits?search=${TAG}&needsReview=false`))).toEqual([`${TAG}-revisada-sem-mapa`]);
    expect(titles(await call('GET', `/api/visits?search=${TAG}&needsReview=true`))).toEqual([`${TAG}-pendente-mapa`]);
  });

  it('hasCoords=false devolve só as sem mapa; true só as com mapa', async () => {
    expect(titles(await call('GET', `/api/visits?search=${TAG}&hasCoords=false`))).toEqual([`${TAG}-revisada-sem-mapa`]);
    expect(titles(await call('GET', `/api/visits?search=${TAG}&hasCoords=true`))).toEqual([`${TAG}-pendente-mapa`]);
  });

  it('isFeatured=false devolve só as não destacadas; true só a destacada', async () => {
    const off = titles(await call('GET', `/api/gallery?search=${TAG}&isFeatured=false`));
    expect(off).toEqual([`${TAG}-comum`]);
    expect(titles(await call('GET', `/api/gallery?search=${TAG}&isFeatured=true`))).toEqual([`${TAG}-destaque`]);
  });

  it('valor inválido responde erro de validação, não filtra errado', async () => {
    const res = await call('GET', '/api/visits?needsReview=talvez');
    expect(res.status).toBe(400);
  });
});
