import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import platformApp from '../src/platformApp.js';
import { generateToken } from '../src/middleware/auth.js';
import { prisma } from '../src/lib/prisma.js';

let server: Server;
let base: string;
let tokenA: string;
let tokenB: string;
let orgA: string;
let orgB: string;
let userA: string;
let userB: string;
let unitA: string;
const headers = (token: string, org: string) => ({ Authorization: `Bearer ${token}`, 'X-Organization-Id': org, 'Content-Type': 'application/json' });
const post = (path: string, body: unknown, token = tokenA, org = orgA) => fetch(`${base}${path}`, { method: 'POST', headers: headers(token, org), body: JSON.stringify(body) });

beforeAll(async () => {
  const a = await prisma.user.create({ data: { email: 'block-a@example.test', passwordHash: 'test', role: 'user' } });
  const b = await prisma.user.create({ data: { email: 'block-b@example.test', passwordHash: 'test', role: 'user' } });
  userA = a.id; userB = b.id; tokenA = generateToken(a); tokenB = generateToken(b);
  const aOrg = await prisma.organization.create({ data: { name: 'A', slug: 'block-test-a', niche: 'pousada' } });
  const bOrg = await prisma.organization.create({ data: { name: 'B', slug: 'block-test-b', niche: 'pousada' } });
  orgA = aOrg.id; orgB = bOrg.id;
  await prisma.membership.create({ data: { organizationId: orgA, userId: a.id, role: 'OWNER' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId: b.id, role: 'OWNER' } });
  unitA = (await prisma.lodgingUnit.create({ data: { organizationId: orgA, name: 'Suíte' } })).id;
  await new Promise<void>(resolve => { server = platformApp.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/lodging`;
});
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.lodgingBlock.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.lodgingReservation.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.lodgingUnit.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  await prisma.$disconnect();
});

describe('bloqueios de unidades', () => {
  it('compartilha noites com reservas, isola empresas e libera apenas suas próprias noites', async () => {
    const input = { unitId: unitA, start: '2031-01-02', end: '2031-01-04', reason: 'Manutenção' };
    expect((await post('/blocks', { ...input, end: input.start })).status).toBe(400);
    expect((await post('/blocks', { ...input, start: '2031-02-30' })).status).toBe(400);
    expect((await post('/blocks', input, tokenB, orgB)).status).toBe(404);
    const created = await post('/blocks', input); expect(created.status).toBe(201);
    const block = await created.json() as { id: string };
    const conflict = { unitId: unitA, guestName: 'Ana', checkIn: '2031-01-01', checkOut: '2031-01-03' };
    expect((await post('/reservations', conflict)).status).toBe(409);
    expect(await prisma.lodgingNight.count({ where: { unitId: unitA, night: '2031-01-01' } })).toBe(0);
    const adjacent = await post('/reservations', { ...conflict, checkIn: '2031-01-04', checkOut: '2031-01-05' });
    expect(adjacent.status).toBe(201);
    const occupancy = await (await fetch(`${base}/occupancy?start=2031-01-02&end=2031-01-05`, { headers: headers(tokenA, orgA) })).json() as { units: { blockedNights: string[]; occupiedNights: string[] }[] };
    expect(occupancy.units[0].blockedNights).toEqual(['2031-01-02', '2031-01-03']);
    expect(occupancy.units[0].occupiedNights).toEqual(['2031-01-02', '2031-01-03', '2031-01-04']);
    expect(JSON.stringify(occupancy)).not.toContain('Manutenção');
    const listed = await (await fetch(`${base}/blocks?page=1&limit=1`, { headers: headers(tokenA, orgA) })).json() as { blocks: { id: string }[]; pagination: { total: number } };
    expect(listed.blocks.map(item => item.id)).toEqual([block.id]);
    expect(listed.pagination.total).toBe(1);
    const other = await (await fetch(`${base}/blocks`, { headers: headers(tokenB, orgB) })).json() as { blocks: unknown[] };
    expect(other.blocks).toEqual([]);
    expect((await post(`/blocks/${block.id}/cancel`, {}, tokenB, orgB)).status).toBe(404);
    expect((await post(`/blocks/${block.id}/cancel`, {})).status).toBe(200);
    expect((await post(`/blocks/${block.id}/cancel`, {})).status).toBe(200);
    expect((await post('/reservations', conflict)).status).toBe(201);
    expect(await prisma.lodgingNight.count({ where: { unitId: unitA, night: '2031-01-04' } })).toBe(1);
    expect((await prisma.lodgingBlock.findUniqueOrThrow({ where: { id: block.id } })).status).toBe('CANCELLED');
  });

  it('aceita uma única operação concorrente para a mesma noite', async () => {
    const block = { unitId: unitA, start: '2031-04-10', end: '2031-04-12' };
    const reservation = { unitId: unitA, guestName: 'Outra', checkIn: block.start, checkOut: block.end };
    const results = await Promise.all([post('/blocks', block), post('/reservations', reservation)]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect(await prisma.lodgingNight.count({ where: { unitId: unitA, night: { gte: block.start, lt: block.end } } })).toBe(2);
    const otherBlock = { ...block, start: '2031-05-10', end: '2031-05-12' };
    const concurrentBlocks = await Promise.all([post('/blocks', otherBlock), post('/blocks', otherBlock)]);
    expect(concurrentBlocks.map(result => result.status).sort()).toEqual([201, 409]);
    expect(await prisma.lodgingNight.count({ where: { unitId: unitA, night: { gte: otherBlock.start, lt: otherBlock.end } } })).toBe(2);
  });
});
