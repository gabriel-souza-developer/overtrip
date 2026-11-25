import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';

// Painel financeiro (/api/finance/summary): só administradores do painel
// OVERTRIP; saídas do banco de destinos e reservas do escopo legado, nunca de
// outra empresa; somente leitura.

const prisma = new PrismaClient();
const TAG = `finance-test:${Date.now()}`;
let server: Server;
let baseUrl: string;
let adminToken: string;
let userToken: string;
let orgId: string;
const userIds: string[] = [];

const get = (path: string, token: string | null) => fetch(`${baseUrl}/api/finance${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const [suffix, role] of [['admin', 'admin'], ['user', 'user']] as const) {
    const user = await prisma.user.create({ data: { email: `test:${TAG}:${suffix}@example.com`, passwordHash: 'unused', role, legacyAccess: true } });
    userIds.push(user.id);
    if (role === 'admin') adminToken = generateToken(user); else userToken = generateToken(user);
  }
  orgId = (await prisma.organization.create({ data: { name: `${TAG}:org`, slug: `${TAG}-org` } })).id;

  await prisma.destination.create({ data: { name: `${TAG} Lagoa`, nameSearch: 'lagoa', outings: { create: [
    { date: day('2025-02-23'), passengers: 31, courtesySeats: 1, pricePerPersonCents: 8500, transportCostCents: 160000, extraCostCents: 13000 },
    { date: day('2024-01-28'), passengers: 15, pricePerPersonCents: 5500, transportCostCents: 80000 },
    { date: day('2025-05-10'), passengers: 10 }, // incompleta
    { date: day('2099-01-01'), passengers: 10, pricePerPersonCents: 1000, transportCostCents: 1000 }, // futura
  ] } } });
  await prisma.destination.create({ data: { name: `${TAG} Estrangeiro`, organizationId: orgId, nameSearch: 'estrangeiro', outings: { create: [
    { date: day('2025-03-01'), passengers: 99, pricePerPersonCents: 100000, transportCostCents: 1 },
  ] } } });

  const makeTrip = (organizationId: string | null, key: string) => prisma.trip.create({ data: {
    organizationId, title: `${TAG} ${key}`, category: 'Teste', description: 'x', city: 'C', region: 'PB', startDateISO: new Date('2099-12-01T06:00:00-03:00'),
    intensityClass: 'leve', includes: '[]', media: '[]', storedIdentity: `${TAG}:${key}`,
  } });
  const trip = await makeTrip(null, 'trip');
  const foreignTrip = await makeTrip(orgId, 'foreign-trip');
  await prisma.reservation.create({ data: { tripId: trip.id, customerName: 'Cliente A', seats: 2, totalCents: 30000, installments: { create: [
    { amountCents: 10000, dueDate: day('2020-01-01'), paidAt: new Date() },
    { amountCents: 10000, dueDate: day('2020-02-01') }, // vencida
    { amountCents: 10000, dueDate: new Date(Date.now() + 5 * 86400000) }, // próximos 30 dias
  ] } } });
  await prisma.reservation.create({ data: { tripId: trip.id, customerName: 'Cancelada', status: 'CANCELLED', totalCents: 99999 } });
  await prisma.reservation.create({ data: { tripId: foreignTrip.id, organizationId: orgId, customerName: 'Outra empresa', totalCents: 77777, installments: { create: [{ amountCents: 77777, dueDate: day('2020-01-01') }] } } });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { trip: { storedIdentity: { startsWith: TAG } } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: TAG } } });
  await prisma.destination.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('painel financeiro', () => {
  it('exige administrador e não guarda em cache', async () => {
    expect((await get('/summary', null)).status).toBe(401);
    expect((await get('/summary', userToken)).status).toBe(403);
    const response = await get('/summary', adminToken);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await get('/summary?year=abc', adminToken)).status).toBe(400);
  });

  it('consolida as saídas por ano, desconta cortesias e ignora futuras e de outra empresa', async () => {
    const all = await (await get('/summary?year=all', adminToken)).json();
    expect(all.outings.year).toBeNull();
    expect(all.outings.years).toEqual([2024, 2025]);
    expect(all.outings.byYear).toMatchObject([
      { year: 2024, resultCents: 2500, completeOutings: 1 },
      { year: 2025, resultCents: 82000, revenueCents: 255000, expenseCents: 173000, completeOutings: 1, outings: 2, courtesySeats: 1, marginPct: 32.2 },
    ]);
    expect(all.outings.incompleteOutings).toBe(1);
    expect(JSON.stringify(all)).not.toContain('Estrangeiro');

    const y2025 = await (await get('/summary?year=2025', adminToken)).json();
    expect(y2025.outings.year).toBe(2025);
    expect(y2025.outings.byMonth).toHaveLength(12);
    expect(y2025.outings.byMonth[1]).toMatchObject({ month: 2, resultCents: 82000 });
    expect(y2025.outings.outings.map((o: { date: string }) => o.date.slice(0, 10))).toEqual(['2025-05-10', '2025-02-23']);
    expect(y2025.outings.outings[0].missing).toEqual(['pricePerPerson', 'costs']);

    const latest = await (await get('/summary', adminToken)).json();
    expect(latest.outings.year).toBe(2025);
  });

  it('resume reservas e parcelas do escopo legado, sem canceladas nem outra empresa', async () => {
    const { reservations } = await (await get('/summary', adminToken)).json();
    expect(reservations).toMatchObject({
      activeReservations: 1, seats: 2, contractedCents: 30000, receivedCents: 10000, receivableCents: 20000,
      openInstallmentsCents: 20000, overdueCents: 10000, overdueInstallments: 1, dueNext30DaysCents: 10000,
    });
    expect(reservations.pendingInstallments).toHaveLength(2);
    expect(reservations.pendingInstallments[0]).toMatchObject({ customerName: 'Cliente A', amountCents: 10000, overdue: true });
    expect(JSON.stringify(reservations)).not.toContain('Outra empresa');
  });
});
