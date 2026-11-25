import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server;
let base: string;
let userId: string;
let token: string;
let orgA: string;
let orgB: string;
let tripA: string;
let tripB: string;
const authorization = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: 'tourism-scoped@example.test', passwordHash: 'test', role: 'admin' } });
  userId = user.id; token = generateToken(user);
  orgA = (await prisma.organization.create({ data: { name: 'Agência A', slug: 'tourism-scoped-a' } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência B', slug: 'tourism-scoped-b' } })).id;
  await prisma.membership.create({ data: { organizationId: orgA, userId, role: 'OWNER' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId, role: 'MEMBER' } });
  const common = { category: 'Teste', description: 'Privado', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'light', includes: '[]', media: '[{"src":"private-fixture"}]' };
  tripA = (await prisma.trip.create({ data: { ...common, title: 'Viagem A', titleSearch: 'viagem a', storedIdentity: 'scoped-trip-a', organizationId: orgA } })).id;
  tripB = (await prisma.trip.create({ data: { ...common, title: 'Viagem B', titleSearch: 'viagem b', storedIdentity: 'scoped-trip-b', organizationId: orgB } })).id;
  await prisma.trip.create({ data: { ...common, title: 'Legado sem empresa', storedIdentity: 'scoped-trip-legacy' } });
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.trip.deleteMany({ where: { storedIdentity: { in: ['scoped-trip-a', 'scoped-trip-b', 'scoped-trip-legacy'] } } });
  await prisma.membership.deleteMany({ where: { userId } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('consulta isolada de viagens por empresa', () => {
  it('exige sessão e lista apenas viagens da empresa escolhida', async () => {
    expect((await fetch(`${base}/${orgA}/tourism/trips`)).status).toBe(401);
    const response = await fetch(`${base}/${orgA}/tourism/trips?page=1&limit=1`, { headers: authorization() });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json() as { data: { id: string }[]; pagination: { total: number } };
    expect(body.data.map(item => item.id)).toEqual([tripA]);
    expect(body.pagination.total).toBe(1);
    expect(JSON.stringify(body)).not.toContain('private-fixture');
    const other = await (await fetch(`${base}/${orgB}/tourism/trips`, { headers: authorization() })).json() as { data: { id: string }[] };
    expect(other.data.map(item => item.id)).toEqual([tripB]);
    expect((await fetch(`${base}/${orgA}/tourism/trips?limit=101`, { headers: authorization() })).status).toBe(400);
  });
  it('filtra busca, situação e período sem incluir viagem de outra empresa', async () => {
    const get = async (query: string) => (await (await fetch(`${base}/${orgA}/tourism/trips?${query}`, { headers: authorization() })).json()) as { data: { id: string }[]; pagination: { total: number } };
    expect((await get('search=VIAGEM%20A&status=DRAFT&period=upcoming')).data.map(item => item.id)).toEqual([tripA]);
    expect((await get('search=viagem%20b')).pagination.total).toBe(0);
    expect((await get('status=OPEN')).pagination.total).toBe(0);
    expect((await get('period=past')).pagination.total).toBe(0);
  });
  it('não revela IDs de outra empresa e revalida revogação imediatamente', async () => {
    expect((await fetch(`${base}/${orgA}/tourism/trips/${tripA}`, { headers: authorization() })).status).toBe(200);
    expect((await fetch(`${base}/${orgA}/tourism/trips/${tripB}`, { headers: authorization() })).status).toBe(404);
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId } }, data: { status: 'REVOKED' } });
    expect((await fetch(`${base}/${orgA}/tourism/trips`, { headers: authorization() })).status).toBe(403);
    expect((await fetch(`${base}/${orgA}/tourism/trips/${tripA}`, { headers: authorization() })).status).toBe(403);
    expect((await fetch(`${base}/${orgB}/tourism/trips/${tripB}`, { headers: authorization() })).status).toBe(200);
  });
});
