import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import app from '../src/platformApp.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server;
let base: string;
let tokenA: string;
let tokenB: string;
let orgA: string;
let orgB: string;
let restaurant: string;
let unitA: string;
let reservationA: string;
const userIds: string[] = [];
const headers = (token: string, org: string) => ({ Authorization: `Bearer ${token}`, 'X-Organization-Id': org, 'Content-Type': 'application/json' });
const create = (path: string, body: unknown, token = tokenA, org = orgA) => fetch(`${base}${path}`, { method: 'POST', headers: headers(token, org), body: JSON.stringify(body) });

beforeAll(async () => {
  const a = await prisma.user.create({ data: { email: 'lodging-a@example.test', passwordHash: 'test', role: 'admin' } });
  const b = await prisma.user.create({ data: { email: 'lodging-b@example.test', passwordHash: 'test', role: 'user' } });
  userIds.push(a.id, b.id); tokenA = generateToken(a); tokenB = generateToken(b);
  const aOrg = await prisma.organization.create({ data: { name: 'A', slug: 'lodging-test-a', niche: 'pousada' } });
  const bOrg = await prisma.organization.create({ data: { name: 'B', slug: 'lodging-test-b', niche: 'pousada' } });
  const rest = await prisma.organization.create({ data: { name: 'R', slug: 'lodging-test-r', niche: 'restaurante' } });
  orgA = aOrg.id; orgB = bOrg.id; restaurant = rest.id;
  await prisma.membership.create({ data: { organizationId: orgA, userId: a.id, role: 'owner' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId: b.id, role: 'staff' } });
  await prisma.membership.create({ data: { organizationId: restaurant, userId: a.id, role: 'owner' } });
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/lodging`;
});
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.lodgingReservation.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.lodgingUnit.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB, restaurant] } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('pousada com isolamento entre empresas', () => {
  it('exige autenticação, vínculo ativo, nicho e papel autorizados', async () => {
    const legacyBase = base.replace('/api/lodging', '/api');
    for (const path of ['/trips', '/gallery', '/leads', '/reservations', '/system']) {
      expect((await fetch(`${legacyBase}${path}`, { headers: headers(tokenA, orgA) })).status).toBe(404);
    }
    expect((await fetch(`${base}/units`)).status).toBe(401);
    expect((await fetch(`${base}/units`, { headers: headers(tokenA, orgB) })).status).toBe(403);
    expect((await fetch(`${base}/units`, { headers: headers(tokenA, restaurant) })).status).toBe(403);
    const result = await create('/units', { name: 'Suíte Azul' });
    expect(result.status).toBe(201); expect(result.headers.get('cache-control')).toContain('no-store');
    unitA = (await result.json() as { id: string }).id;
    expect((await create('/units', { name: 'Suíte Azul' })).status).toBe(409);
    const other = await (await fetch(`${base}/units`, { headers: headers(tokenB, orgB) })).json() as { units: unknown[] };
    expect(other.units).toEqual([]);
    expect((await create('/reservations', { unitId: unitA, guestName: 'B', checkIn: '2030-01-01', checkOut: '2030-01-02' }, tokenB, orgB)).status).toBe(404);
    await prisma.membership.update({ where: { userId_organizationId: { userId: userIds[1], organizationId: orgB } }, data: { role: 'viewer' } });
    expect((await fetch(`${base}/units`, { headers: headers(tokenB, orgB) })).status).toBe(403);
    await prisma.membership.update({ where: { userId_organizationId: { userId: userIds[1], organizationId: orgB } }, data: { role: 'staff' } });
    await prisma.organization.update({ where: { id: orgB }, data: { status: 'INACTIVE' } });
    expect((await fetch(`${base}/units`, { headers: headers(tokenB, orgB) })).status).toBe(403);
    await prisma.organization.update({ where: { id: orgB }, data: { status: 'ACTIVE' } });
  });
  it('valida datas, impede interseção e aceita saída no dia da próxima chegada', async () => {
    const input = { unitId: unitA, guestName: 'Ana', checkIn: '2030-01-01', checkOut: '2030-01-03' };
    expect((await create('/reservations', { ...input, checkOut: '2030-01-01' })).status).toBe(400);
    expect((await create('/reservations', { ...input, checkIn: '2030-02-30' })).status).toBe(400);
    expect((await create('/reservations', { ...input, checkOut: '2032-01-03' })).status).toBe(400);
    const created = await create('/reservations', input); expect(created.status).toBe(201);
    reservationA = (await created.json() as { id: string }).id;
    // A primeira noite está livre e a segunda conflita: nenhuma noite parcial pode sobrar.
    expect((await create('/reservations', { ...input, checkIn: '2029-12-31', checkOut: '2030-01-02' })).status).toBe(409);
    expect((await create('/reservations', { ...input, checkIn: '2029-12-31', checkOut: '2030-01-01' })).status).toBe(201);
    expect((await create('/reservations', { ...input, checkIn: '2030-01-02', checkOut: '2030-01-04' })).status).toBe(409);
    expect((await create('/reservations', { ...input, checkIn: '2030-01-03', checkOut: '2030-01-04' })).status).toBe(201);
    const other = await (await fetch(`${base}/reservations`, { headers: headers(tokenB, orgB) })).json() as { reservations: unknown[] };
    expect(other.reservations).toEqual([]);
    expect((await create(`/reservations/${reservationA}/cancel`, {}, tokenB, orgB)).status).toBe(404);
    expect((await create(`/reservations/${reservationA}/cancel`, {})).status).toBe(200);
    expect((await create(`/reservations/${reservationA}/cancel`, {})).status).toBe(200);
    expect((await create('/reservations', input)).status).toBe(201);
  });
  it('uma única reserva concorrente ocupa a mesma unidade e noites', async () => {
    const input = { unitId: unitA, guestName: 'Concorrente', checkIn: '2030-04-10', checkOut: '2030-04-12' };
    const results = await Promise.all([create('/reservations', input), create('/reservations', input)]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect(await prisma.lodgingNight.count({ where: { unitId: unitA, night: { gte: input.checkIn, lt: input.checkOut } } })).toBe(2);
  });
  it('registra chegada e saída com transições controladas, mantendo as noites ocupadas', async () => {
    const input = { unitId: unitA, guestName: 'Hóspede operacional', checkIn: '2030-06-10', checkOut: '2030-06-12' };
    const created = await create('/reservations', input);
    expect(created.status).toBe(201);
    const { id } = await created.json() as { id: string };
    expect((await create(`/reservations/${id}/check-in`, {}, tokenB, orgB)).status).toBe(404);
    expect((await create(`/reservations/${id}/check-out`, {})).status).toBe(409);
    const arrivals = await Promise.all([create(`/reservations/${id}/check-in`, {}), create(`/reservations/${id}/check-in`, {})]);
    expect(arrivals.map(item => item.status)).toEqual([200, 200]);
    expect((await arrivals[0].json() as { status: string }).status).toBe('CHECKED_IN');
    expect((await create(`/reservations/${id}/cancel`, {})).status).toBe(409);
    const departure = await create(`/reservations/${id}/check-out`, {});
    expect(departure.status).toBe(200);
    expect(await departure.json()).toMatchObject({ status: 'CHECKED_OUT', checkIn: input.checkIn, checkOut: input.checkOut });
    expect((await create(`/reservations/${id}/check-out`, {})).status).toBe(200);
    expect((await create(`/reservations/${id}/check-in`, {})).status).toBe(409);
    expect((await create(`/reservations/${id}/cancel`, {})).status).toBe(409);
    expect((await create('/reservations', input)).status).toBe(409);
    expect(await prisma.lodgingNight.count({ where: { reservationId: id } })).toBe(2);
  });
  it('não permite chegada ou saída depois do cancelamento', async () => {
    const input = { unitId: unitA, guestName: 'Cancelada', checkIn: '2030-07-10', checkOut: '2030-07-11' };
    const created = await create('/reservations', input);
    const { id } = await created.json() as { id: string };
    expect((await create(`/reservations/${id}/cancel`, {})).status).toBe(200);
    expect((await create(`/reservations/${id}/check-in`, {})).status).toBe(409);
    expect((await create(`/reservations/${id}/check-out`, {})).status).toBe(409);
  });
});
