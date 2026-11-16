import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/platformApp.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server;
let base: string;
let token: string;
let orgId: string;
let otherOrgId: string;
let userId: string;
let unitId: string;
const headers = () => ({ Authorization: `Bearer ${token}`, 'X-Organization-Id': orgId });
const get = (path: string) => fetch(`${base}${path}`, { headers: headers() });

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: 'lodging-pagination@example.test', passwordHash: 'test', role: 'user' } });
  userId = user.id; token = generateToken(user);
  const org = await prisma.organization.create({ data: { name: 'A', slug: 'lodging-page-a', niche: 'pousada' } });
  const other = await prisma.organization.create({ data: { name: 'B', slug: 'lodging-page-b', niche: 'pousada' } });
  orgId = org.id; otherOrgId = other.id;
  await prisma.membership.create({ data: { userId, organizationId: orgId, role: 'staff' } });
  await prisma.lodgingUnit.createMany({ data: Array.from({ length: 22 }, (_, index) => ({ organizationId: orgId, name: `Unidade ${String(index).padStart(2, '0')}` })) });
  const first = await prisma.lodgingUnit.findFirstOrThrow({ where: { organizationId: orgId }, orderBy: { name: 'asc' } });
  unitId = first.id;
  const otherUnit = await prisma.lodgingUnit.create({ data: { organizationId: otherOrgId, name: 'Confidencial' } });
  for (let day = 1; day <= 23; day++) {
    const checkIn = `2030-01-${String(day).padStart(2, '0')}`;
    const checkOut = `2030-01-${String(day + 1).padStart(2, '0')}`;
    await prisma.lodgingReservation.create({ data: { organizationId: orgId, unitId, guestName: day === 22 ? 'JOÃO 100%_' : `Pessoa ${day}`, checkIn, checkOut, nights: { create: [{ night: checkIn }] } } });
  }
  await prisma.lodgingReservation.create({ data: { organizationId: otherOrgId, unitId: otherUnit.id, guestName: 'Segredo', checkIn: '2030-01-22', checkOut: '2030-01-23', nights: { create: [{ night: '2030-01-22' }] } } });
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/lodging`;
});

afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.lodgingReservation.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId].filter(Boolean) } } });
  await prisma.lodgingUnit.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId].filter(Boolean) } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId].filter(Boolean) } } });
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('listas e grade da pousada', () => {
  it('pagina unidades e reservas sem truncar a ocupação ou o movimento', async () => {
    const units = await (await get('/units?page=1&limit=20')).json() as { units: { id: string }[]; pagination: { total: number; totalPages: number } };
    expect(units.units).toHaveLength(20); expect(units.pagination).toMatchObject({ total: 22, totalPages: 2 });
    const secondUnits = await (await get('/units?page=2&limit=20')).json() as typeof units;
    expect(secondUnits.units).toHaveLength(2);
    const first = await (await get('/reservations?page=1&limit=20')).json() as { reservations: { guestName: string }[]; pagination: { total: number; totalPages: number } };
    expect(first.reservations).toHaveLength(20); expect(first.pagination).toMatchObject({ total: 23, totalPages: 2 });
    expect(first.reservations.some(row => row.guestName.includes('JOÃO'))).toBe(false);
    const occupancyResponse = await get('/occupancy?start=2030-01-22&end=2030-01-23&page=1&limit=20');
    expect(occupancyResponse.headers.get('cache-control')).toContain('no-store');
    const occupancy = await occupancyResponse.json() as { units: { id: string; occupiedNights: string[] }[]; pagination: { total: number } };
    expect(occupancy.pagination.total).toBe(22);
    expect(occupancy.units.find(unit => unit.id === unitId)?.occupiedNights).toEqual(['2030-01-22']);
    expect(JSON.stringify(occupancy)).not.toContain('Segredo');
    const movement = await (await get('/movement?date=2030-01-22')).json();
    expect(movement).toEqual({ arrivals: 1, departures: 0, overdueArrivals: 21, overdueDepartures: 0 });
    const match = await (await get(`/reservations?page=1&limit=1&status=CONFIRMED&search=${encodeURIComponent('joão 100%_')}`)).json() as typeof first;
    expect(match.pagination.total).toBe(1); expect(match.reservations[0].guestName).toBe('JOÃO 100%_');
    const missing = await (await get(`/reservations?page=1&search=${encodeURIComponent('%inexistente')}`)).json() as typeof first;
    expect(missing.pagination.total).toBe(0);
    expect((await get('/occupancy?start=2030-01-22&end=2030-01-22')).status).toBe(400);
    expect((await get('/occupancy?start=2030-01-01&end=2030-02-02')).status).toBe(400);
    expect((await get('/occupancy?start=2030-02-30&end=2030-03-01')).status).toBe(400);
    expect((await get('/units?page=0')).status).toBe(400);
    expect((await get('/reservations?limit=51')).status).toBe(400);
    expect((await get('/movement?date=not-a-date')).status).toBe(400);
    expect((await get('/reservations?status=INVALID')).status).toBe(400);
    const legacy = await (await get('/units')).json() as { units: unknown[]; pagination?: unknown };
    expect(legacy.units).toHaveLength(22); expect(legacy.pagination).toBeUndefined();
  });
});
