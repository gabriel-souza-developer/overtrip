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
let lodging: string;
let tableA: string;
const userIds: string[] = [];
const headers = (token: string, org: string) => ({ Authorization: `Bearer ${token}`, 'X-Organization-Id': org, 'Content-Type': 'application/json' });
const create = (path: string, body: unknown, token = tokenA, org = orgA) => fetch(`${base}${path}`, { method: 'POST', headers: headers(token, org), body: JSON.stringify(body) });

beforeAll(async () => {
  const a = await prisma.user.create({ data: { email: 'restaurant-a@example.test', passwordHash: 'test', role: 'admin' } });
  const b = await prisma.user.create({ data: { email: 'restaurant-b@example.test', passwordHash: 'test', role: 'user' } });
  userIds.push(a.id, b.id); tokenA = generateToken(a); tokenB = generateToken(b);
  const aOrg = await prisma.organization.create({ data: { name: 'A', slug: 'restaurant-test-a', niche: 'restaurante' } });
  const bOrg = await prisma.organization.create({ data: { name: 'B', slug: 'restaurant-test-b', niche: 'restaurante' } });
  const lodge = await prisma.organization.create({ data: { name: 'L', slug: 'restaurant-test-l', niche: 'pousada' } });
  orgA = aOrg.id; orgB = bOrg.id; lodging = lodge.id;
  await prisma.membership.create({ data: { organizationId: orgA, userId: a.id, role: 'OWNER' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId: b.id, role: 'MEMBER' } });
  await prisma.membership.create({ data: { organizationId: lodging, userId: a.id, role: 'OWNER' } });
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/restaurant`;
});
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.restaurantReservation.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.restaurantTable.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB, lodging] } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('restaurante com isolamento entre empresas', () => {
  it('exige autenticação, vínculo ativo, nicho e papel autorizados', async () => {
    expect((await fetch(`${base}/tables`)).status).toBe(401);
    expect((await fetch(`${base}/tables`, { headers: headers(tokenA, orgB) })).status).toBe(403);
    expect((await fetch(`${base}/tables`, { headers: headers(tokenA, lodging) })).status).toBe(403);
    const result = await create('/tables', { name: 'Mesa 1', capacity: 4 });
    expect(result.status).toBe(201); expect(result.headers.get('cache-control')).toContain('no-store');
    tableA = (await result.json() as { id: string }).id;
    expect((await create('/tables', { name: 'Mesa 1', capacity: 2 })).status).toBe(409);
    const other = await (await fetch(`${base}/tables`, { headers: headers(tokenB, orgB) })).json() as { tables: unknown[] };
    expect(other.tables).toEqual([]);
    expect((await create('/reservations', { tableId: tableA, guestName: 'B', partySize: 2, date: '2030-01-01', shift: 'JANTAR', time: '20:00' }, tokenB, orgB)).status).toBe(404);
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgB, userId: userIds[1] } }, data: { role: 'viewer' } });
    expect((await fetch(`${base}/tables`, { headers: headers(tokenB, orgB) })).status).toBe(403);
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgB, userId: userIds[1] } }, data: { role: 'MEMBER' } });
    await prisma.organization.update({ where: { id: orgB }, data: { status: 'INACTIVE' } });
    expect((await fetch(`${base}/tables`, { headers: headers(tokenB, orgB) })).status).toBe(403);
    await prisma.organization.update({ where: { id: orgB }, data: { status: 'ACTIVE' } });
  });
  it('valida capacidade, impede conflito no mesmo turno e aceita outro turno no mesmo dia', async () => {
    const input = { tableId: tableA, guestName: 'Ana', partySize: 4, date: '2030-02-01', shift: 'JANTAR' as const, time: '20:00' };
    expect((await create('/reservations', { ...input, partySize: 5 })).status).toBe(400);
    expect((await create('/reservations', { ...input, date: '2030-02-30' })).status).toBe(400);
    expect((await create('/reservations', { ...input, time: '25:00' })).status).toBe(400);
    const created = await create('/reservations', input); expect(created.status).toBe(201);
    const reservationA = (await created.json() as { id: string }).id;
    expect((await create('/reservations', { ...input, guestName: 'Outra' })).status).toBe(409);
    expect((await create('/reservations', { ...input, shift: 'ALMOCO', guestName: 'Outro turno' })).status).toBe(201);
    const other = await (await fetch(`${base}/reservations`, { headers: headers(tokenB, orgB) })).json() as { reservations: unknown[] };
    expect(other.reservations).toEqual([]);
    expect((await create(`/reservations/${reservationA}/cancel`, {}, tokenB, orgB)).status).toBe(404);
    expect((await create(`/reservations/${reservationA}/cancel`, {})).status).toBe(200);
    expect((await create(`/reservations/${reservationA}/cancel`, {})).status).toBe(200);
    expect((await create('/reservations', input)).status).toBe(201);
  });
  it('uma única reserva concorrente ocupa a mesma mesa e turno', async () => {
    const input = { tableId: tableA, guestName: 'Concorrente', partySize: 2, date: '2030-04-10', shift: 'ALMOCO' as const, time: '12:30' };
    const results = await Promise.all([create('/reservations', input), create('/reservations', input)]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect(await prisma.restaurantOccupancy.count({ where: { tableId: tableA, date: input.date, shift: input.shift } })).toBe(1);
  });
  it('registra chegada e ausência com transições controladas, sem liberar o turno', async () => {
    const input = { tableId: tableA, guestName: 'Grupo operacional', partySize: 3, date: '2030-06-10', shift: 'JANTAR' as const, time: '21:00' };
    const created = await create('/reservations', input);
    expect(created.status).toBe(201);
    const { id } = await created.json() as { id: string };
    expect((await create(`/reservations/${id}/arrive`, {}, tokenB, orgB)).status).toBe(404);
    expect((await create(`/reservations/${id}/no-show`, {})).status).toBe(200);
    expect((await create(`/reservations/${id}/arrive`, {})).status).toBe(409);
    expect((await create(`/reservations/${id}/no-show`, {})).status).toBe(200);
    expect((await create(`/reservations/${id}/cancel`, {})).status).toBe(409);
    expect((await create('/reservations', input)).status).toBe(409);
    expect(await prisma.restaurantOccupancy.count({ where: { reservationId: id } })).toBe(1);
  });
  it('não permite chegada ou ausência depois do cancelamento', async () => {
    const input = { tableId: tableA, guestName: 'Cancelada', partySize: 2, date: '2030-07-10', shift: 'ALMOCO' as const, time: '12:00' };
    const created = await create('/reservations', input);
    const { id } = await created.json() as { id: string };
    expect((await create(`/reservations/${id}/cancel`, {})).status).toBe(200);
    expect((await create(`/reservations/${id}/arrive`, {})).status).toBe(409);
    expect((await create(`/reservations/${id}/no-show`, {})).status).toBe(409);
  });
});
