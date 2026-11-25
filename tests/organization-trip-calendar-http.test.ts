import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

// Agenda do painel da empresa: intervalo de datas, nunca paginação por
// página de resultado. Cobre isolamento entre duas empresas, os papéis
// OWNER/MEMBER/estranho, revogação imediata e o limite seguro de resultados
// (que deve avisar via `truncated`, nunca recortar em silêncio).

let server: Server;
let base: string;
let ownerId: string; let ownerToken: string;
let memberId: string; let memberToken: string;
let strangerId: string; let strangerToken: string;
let orgA: string; let orgB: string;
let tripInsideA: string; let tripOutsideA: string; let tripB: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const tripBase = { category: 'Teste', description: 'Agenda', city: 'Cidade', region: 'PB', intensityClass: 'leve', includes: '[]', media: '[]' };

beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: `org-calendar-owner:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  const member = await prisma.user.create({ data: { email: `org-calendar-member:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  memberId = member.id; memberToken = generateToken(member);
  const stranger = await prisma.user.create({ data: { email: `org-calendar-stranger:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  strangerId = stranger.id; strangerToken = generateToken(stranger);

  orgA = (await prisma.organization.create({ data: { name: 'Agenda A', slug: `agenda-a-${Date.now()}` } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agenda B', slug: `agenda-b-${Date.now()}` } })).id;
  await prisma.membership.create({ data: { organizationId: orgA, userId: ownerId, role: 'OWNER' } });
  await prisma.membership.create({ data: { organizationId: orgA, userId: memberId, role: 'MEMBER' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId: ownerId, role: 'OWNER' } });

  tripInsideA = (await prisma.trip.create({ data: { ...tripBase, title: 'Dentro de junho A', storedIdentity: 'calendar-inside-a', organizationId: orgA, startDateISO: new Date('2031-06-15T12:00:00.000Z') } })).id;
  tripOutsideA = (await prisma.trip.create({ data: { ...tripBase, title: 'Fora de junho A', storedIdentity: 'calendar-outside-a', organizationId: orgA, startDateISO: new Date('2031-08-15T12:00:00.000Z') } })).id;
  tripB = (await prisma.trip.create({ data: { ...tripBase, title: 'Dentro de junho B', storedIdentity: 'calendar-inside-b', organizationId: orgB, startDateISO: new Date('2031-06-15T12:00:00.000Z') } })).id;
  await prisma.trip.create({ data: { ...tripBase, title: 'Legado sem empresa', storedIdentity: 'calendar-legacy', startDateISO: new Date('2031-06-15T12:00:00.000Z') } });

  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.trip.deleteMany({ where: { storedIdentity: { in: ['calendar-inside-a', 'calendar-outside-a', 'calendar-inside-b', 'calendar-legacy'] } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: 'calendar-truncation-' } } });
  await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, memberId, strangerId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId, strangerId] } } });
  await prisma.$disconnect();
});

describe('agenda de viagens por intervalo (empresa)', () => {
  it('exige sessão, isola por empresa e filtra pelo intervalo pedido', async () => {
    const url = `${base}/${orgA}/tourism/trips/calendar?start=2031-06-01&end=2031-06-30`;
    expect((await fetch(url)).status).toBe(401);

    const response = await fetch(url, { headers: auth(ownerToken) });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json() as { data: { id: string }[]; total: number; truncated: boolean };
    expect(body.data.map(item => item.id)).toEqual([tripInsideA]);
    expect(body.total).toBe(1);
    expect(body.truncated).toBe(false);

    const otherOrg = await (await fetch(`${base}/${orgB}/tourism/trips/calendar?start=2031-06-01&end=2031-06-30`, { headers: auth(ownerToken) })).json() as { data: { id: string }[] };
    expect(otherOrg.data.map(item => item.id)).toEqual([tripB]);

    const augustResponse = await (await fetch(`${base}/${orgA}/tourism/trips/calendar?start=2031-08-01&end=2031-08-31`, { headers: auth(ownerToken) })).json() as { data: { id: string }[] };
    expect(augustResponse.data.map(item => item.id)).toEqual([tripOutsideA]);
  });

  it('MEMBER lê a agenda, mas quem não tem vínculo é recusado, e a revogação vale na mesma hora', async () => {
    const url = `${base}/${orgA}/tourism/trips/calendar?start=2031-06-01&end=2031-06-30`;
    const memberResponse = await fetch(url, { headers: auth(memberToken) });
    expect(memberResponse.status).toBe(200);
    expect((await memberResponse.json() as { data: { id: string }[] }).data.map(item => item.id)).toEqual([tripInsideA]);

    expect((await fetch(url, { headers: auth(strangerToken) })).status).toBe(403);

    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: memberId } }, data: { status: 'REVOKED' } });
    expect((await fetch(url, { headers: auth(memberToken) })).status).toBe(403);
  });

  it('recusa intervalo inválido ou maior que o permitido, sem vazar dados de outra empresa', async () => {
    const get = (query: string) => fetch(`${base}/${orgB}/tourism/trips/calendar?${query}`, { headers: auth(ownerToken) });
    expect((await get('start=2031-06-31&end=2031-06-01')).status).toBe(400);
    expect((await get('start=15-06-2031&end=2031-06-30')).status).toBe(400);
    expect((await get('start=2031-01-01&end=2031-12-31')).status).toBe(400);
    expect((await fetch(`${base}/${orgA}/tourism/trips/calendar?start=2031-06-01&end=2031-06-30`, { headers: auth(ownerToken) })).status).toBe(200);
  });

  it('avisa quando há mais viagens que o limite seguro, em vez de recortar em silêncio', async () => {
    const count = 501;
    await prisma.trip.createMany({ data: Array.from({ length: count }, (_, i) => ({
      ...tripBase, title: `Lote ${i}`, storedIdentity: `calendar-truncation-${i}`, organizationId: orgA,
      startDateISO: new Date('2032-03-10T12:00:00.000Z'),
    })) });
    const response = await fetch(`${base}/${orgA}/tourism/trips/calendar?start=2032-03-01&end=2032-03-31`, { headers: auth(ownerToken) });
    expect(response.status).toBe(200);
    const body = await response.json() as { data: unknown[]; total: number; truncated: boolean };
    expect(body.total).toBe(count);
    expect(body.data.length).toBeLessThan(count);
    expect(body.truncated).toBe(true);
  });
});
