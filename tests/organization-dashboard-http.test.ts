import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server;
let url: string;
let ownerToken: string;
let memberToken: string;
let outsiderToken: string;
const users: string[] = [];
const orgA = 'dashboard-test-a';
const orgB = 'dashboard-test-b';

beforeAll(async () => {
  const owners = await Promise.all(['owner', 'member', 'outsider'].map(name => prisma.user.create({ data: { email: `dashboard-${name}@example.test`, passwordHash: 'test', role: 'editor' } })));
  users.push(...owners.map(user => user.id));
  [ownerToken, memberToken, outsiderToken] = owners.map(generateToken);
  await prisma.organization.createMany({ data: [{ id: orgA, name: 'A', slug: orgA }, { id: orgB, name: 'B', slug: orgB }] });
  await prisma.membership.createMany({ data: [{ organizationId: orgA, userId: owners[0].id, role: 'OWNER' }, { organizationId: orgA, userId: owners[1].id, role: 'MEMBER' }, { organizationId: orgB, userId: owners[2].id, role: 'OWNER' }] });
  const base = { category: 'Passeio', description: 'Teste', city: 'Cidade', region: 'PB', startDateISO: new Date('2090-01-01T12:00:00Z'), intensityClass: 'leve', includes: '[]', media: '[]' };
  await prisma.trip.createMany({ data: [...Array.from({ length: 25 }, (_, i) => ({ ...base, title: `A ${i}`, organizationId: orgA, storedIdentity: `dashboard-a-${i}`, status: i === 0 ? 'OPEN' : 'DRAFT' })), { ...base, title: 'B', organizationId: orgB, storedIdentity: 'dashboard-b', status: 'OPEN' }] });
  const tripA = await prisma.trip.findFirstOrThrow({ where: { organizationId: orgA } });
  const tripB = await prisma.trip.findFirstOrThrow({ where: { organizationId: orgB } });
  await prisma.lead.createMany({ data: [{ name: 'Privado A', organizationId: orgA }, { name: 'Privado B', organizationId: orgB }] });
  await prisma.reservation.createMany({ data: [{ customerName: 'Cliente A', tripId: tripA.id, organizationId: orgA, totalCents: 100 }, { customerName: 'Cliente B', tripId: tripB.id, organizationId: orgB, totalCents: 200 }, { customerName: 'Cruzado', tripId: tripB.id, organizationId: orgA, totalCents: 300 }] });
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations/${orgA}/tourism/dashboard`;
});

afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.reservation.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.lead.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.trip.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.membership.deleteMany({ where: { userId: { in: users } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe('resumo de empresa', () => {
  it('conta todos os registros próprios e não inclui reservas com viagem estrangeira', async () => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${ownerToken}` } });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({ trips: { total: 25, upcoming: 25, open: 1, drafts: 24 }, leads: 1, reservations: 1 });
  });
  it('não expõe contagens privadas a MEMBER ou empresa não vinculada e revalida revogação', async () => {
    const member = await fetch(url, { headers: { Authorization: `Bearer ${memberToken}` } });
    expect(member.status).toBe(200);
    const data = await member.json();
    expect(data).not.toHaveProperty('leads');
    expect(data).not.toHaveProperty('reservations');
    expect((await fetch(url, { headers: { Authorization: `Bearer ${outsiderToken}` } })).status).toBe(403);
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: users[1] } }, data: { status: 'REVOKED' } });
    expect((await fetch(url, { headers: { Authorization: `Bearer ${memberToken}` } })).status).toBe(403);
  });
});
