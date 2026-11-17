import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server, base: string, orgA: string, orgB: string, ownerId: string, memberId: string;
let ownerToken: string, memberToken: string, tripA: string, tripB: string, leadA: string, leadB: string;
let reservationA: string, reservationB: string, inconsistentTrip: string, inconsistentLead: string, nullLead: string, legacy: string;
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
const userIds: string[] = [];
const reservationIds: string[] = [];

beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: 'org-res-owner@example.test', passwordHash: 'test', role: 'user' } });
  const member = await prisma.user.create({ data: { email: 'org-res-member@example.test', passwordHash: 'test', role: 'admin' } });
  ownerId = owner.id; memberId = member.id; userIds.push(ownerId, memberId);
  ownerToken = generateToken(owner); memberToken = generateToken(member);
  orgA = (await prisma.organization.create({ data: { name: 'Agência reserva A', slug: 'org-res-a' } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência reserva B', slug: 'org-res-b' } })).id;
  await prisma.membership.createMany({ data: [
    { userId: ownerId, organizationId: orgA, role: 'OWNER' },
    { userId: ownerId, organizationId: orgB, role: 'ADMIN' },
    { userId: memberId, organizationId: orgA, role: 'MEMBER' },
  ] });
  const trip = { category: 'Teste', description: 'Teste', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'light', includes: '[]', media: '[]' };
  tripA = (await prisma.trip.create({ data: { ...trip, organizationId: orgA, storedIdentity: 'org-res-trip-a', title: 'Viagem A' } })).id;
  tripB = (await prisma.trip.create({ data: { ...trip, organizationId: orgB, storedIdentity: 'org-res-trip-b', title: 'Viagem B' } })).id;
  const tripNull = (await prisma.trip.create({ data: { ...trip, storedIdentity: 'org-res-trip-null', title: 'Viagem legada' } })).id;
  leadA = (await prisma.lead.create({ data: { organizationId: orgA, name: 'Interessado próprio', tripId: tripA } })).id;
  leadB = (await prisma.lead.create({ data: { organizationId: orgB, name: 'Interessado privado B', tripId: tripB } })).id;
  const legacyLead = (await prisma.lead.create({ data: { name: 'Interessado legado', tripId: tripNull } })).id;
  const create = async (data: { organizationId?: string; tripId: string; leadId?: string; customerName: string }) => {
    const row = await prisma.reservation.create({ data: { ...data, seats: 1, totalCents: 10000 } });
    reservationIds.push(row.id); return row.id;
  };
  reservationA = await create({ organizationId: orgA, tripId: tripA, leadId: leadA, customerName: 'Reserva A' });
  reservationB = await create({ organizationId: orgB, tripId: tripB, leadId: leadB, customerName: 'Reserva privada B' });
  inconsistentTrip = await create({ organizationId: orgA, tripId: tripB, customerName: 'Referência estrangeira' });
  inconsistentLead = await create({ organizationId: orgA, tripId: tripA, leadId: leadB, customerName: 'Lead estrangeiro' });
  nullLead = await create({ organizationId: orgA, tripId: tripA, leadId: legacyLead, customerName: 'Lead legado' });
  await create({ organizationId: orgA, tripId: tripNull, customerName: 'Viagem legada' });
  legacy = await create({ tripId: tripA, customerName: 'Reserva legada' });
  await prisma.reservationInstallment.create({ data: { reservationId: reservationA, amountCents: 3500 } });
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.reservationInstallment.deleteMany({ where: { reservationId: { in: reservationIds } } });
  await prisma.reservation.deleteMany({ where: { id: { in: reservationIds } } });
  await prisma.lead.deleteMany({ where: { name: { in: ['Interessado próprio', 'Interessado privado B', 'Interessado legado'] } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { in: ['org-res-trip-a', 'org-res-trip-b', 'org-res-trip-null'] } } });
  await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('consulta privada de reservas por empresa', () => {
  it('filtra empresa e viagem, omite referências inseguras e pagina as linhas seguras', async () => {
    expect((await fetch(`${base}/${orgA}/tourism/reservations`)).status).toBe(401);
    expect((await fetch(`${base}/${orgA}/tourism/reservations`, { headers: headers(memberToken) })).status).toBe(403);
    expect((await fetch(`${base}/${orgA}/tourism/reservations/${reservationA}`, { headers: headers(memberToken) })).status).toBe(403);
    const response = await fetch(`${base}/${orgA}/tourism/reservations?limit=2&page=1`, { headers: headers(ownerToken) });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    type Item = { id: string; leadId: string | null; installments: { amountCents: number }[] };
    const first = await response.json() as { data: Item[]; pagination: { total: number; totalPages: number } };
    const second = await (await fetch(`${base}/${orgA}/tourism/reservations?limit=2&page=2`, { headers: headers(ownerToken) })).json() as typeof first;
    expect(first.pagination).toMatchObject({ total: 3, totalPages: 2 });
    const all = [...first.data, ...second.data];
    expect(new Set(all.map(row => row.id))).toEqual(new Set([reservationA, inconsistentLead, nullLead]));
    expect(all.find(row => row.id === reservationA)).toMatchObject({ leadId: leadA, installments: [{ amountCents: 3500 }] });
    expect(all.find(row => row.id === inconsistentLead)?.leadId).toBeNull();
    expect(all.find(row => row.id === nullLead)?.leadId).toBeNull();
    expect(JSON.stringify(all)).not.toContain(leadB);
    expect(JSON.stringify(all)).not.toContain('Interessado privado B');
    expect((await fetch(`${base}/${orgA}/tourism/reservations?limit=101`, { headers: headers(ownerToken) })).status).toBe(400);
  });
  it('retorna 404 para registros cruzados ou inconsistentes e revalida vínculo', async () => {
    for (const id of [reservationB, inconsistentTrip, legacy]) {
      expect((await fetch(`${base}/${orgA}/tourism/reservations/${id}`, { headers: headers(ownerToken) })).status).toBe(404);
    }
    const detail = await (await fetch(`${base}/${orgA}/tourism/reservations/${inconsistentLead}`, { headers: headers(ownerToken) })).json() as { leadId: string | null };
    expect(detail.leadId).toBeNull();
    expect((await fetch(`${base}/${orgB}/tourism/reservations/${reservationB}`, { headers: headers(ownerToken) })).status).toBe(200);
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'REVOKED' } });
    expect((await fetch(`${base}/${orgA}/tourism/reservations`, { headers: headers(ownerToken) })).status).toBe(403);
    expect((await fetch(`${base}/${orgA}/tourism/reservations/${reservationA}`, { headers: headers(ownerToken) })).status).toBe(403);
    expect((await fetch(`${base}/${orgB}/tourism/reservations/${reservationB}`, { headers: headers(ownerToken) })).status).toBe(200);
  });
});
