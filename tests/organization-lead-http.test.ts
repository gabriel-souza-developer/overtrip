import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server, base: string, orgA: string, orgB: string, ownerId: string, memberId: string;
let ownerToken: string, memberToken: string, leadA: string, leadB: string, foreignTrip: string, ownTrip: string;
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
const userIds: string[] = [];
beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: 'org-lead-owner@example.test', passwordHash: 'test', role: 'user' } });
  const member = await prisma.user.create({ data: { email: 'org-lead-member@example.test', passwordHash: 'test', role: 'admin' } });
  ownerId = owner.id; memberId = member.id; userIds.push(ownerId, memberId);
  ownerToken = generateToken(owner); memberToken = generateToken(member);
  orgA = (await prisma.organization.create({ data: { name: 'Agência lead A', slug: 'org-lead-a' } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência lead B', slug: 'org-lead-b' } })).id;
  await prisma.membership.createMany({ data: [
    { userId: ownerId, organizationId: orgA, role: 'OWNER' },
    { userId: ownerId, organizationId: orgB, role: 'ADMIN' },
    { userId: memberId, organizationId: orgA, role: 'MEMBER' },
  ] });
  const trip = { category: 'Teste', description: 'Teste', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'light', includes: '[]', media: '[]' };
  ownTrip = (await prisma.trip.create({ data: { ...trip, organizationId: orgA, storedIdentity: 'org-lead-trip-a', title: 'Viagem A' } })).id;
  foreignTrip = (await prisma.trip.create({ data: { ...trip, organizationId: orgB, storedIdentity: 'org-lead-trip-b', title: 'Viagem B' } })).id;
  leadA = (await prisma.lead.create({ data: { organizationId: orgA, name: 'Contato A', phone: '83999990000', email: 'a@example.test', tripId: ownTrip, notes: 'nota privada' } })).id;
  leadB = (await prisma.lead.create({ data: { organizationId: orgB, name: 'Contato B', tripId: foreignTrip } })).id;
  await prisma.lead.create({ data: { organizationId: orgA, name: 'Referência inconsistente', tripId: foreignTrip } });
  await prisma.lead.create({ data: { name: 'Legado sem agência' } });
  await prisma.leadEvent.create({ data: { leadId: leadA, body: 'histórico privado' } });
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.leadEvent.deleteMany({ where: { leadId: leadA } });
  await prisma.lead.deleteMany({ where: { name: { in: ['Contato A', 'Contato B', 'Referência inconsistente', 'Legado sem agência'] } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { in: ['org-lead-trip-a', 'org-lead-trip-b'] } } });
  await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('consulta privada de interessados por empresa', () => {
  it('exige autenticação e papel autorizado no vínculo, não o papel global', async () => {
    expect((await fetch(`${base}/${orgA}/tourism/leads`)).status).toBe(401);
    expect((await fetch(`${base}/${orgA}/tourism/leads`, { headers: headers(memberToken) })).status).toBe(403);
    expect((await fetch(`${base}/${orgA}/tourism/leads/${leadA}`, { headers: headers(memberToken) })).status).toBe(403);
    const response = await fetch(`${base}/${orgA}/tourism/leads`, { headers: headers(ownerToken) });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const result = await response.json() as { data: { id: string; name: string; tripId: string | null }[]; pagination: { total: number } };
    expect(result.pagination.total).toBe(2);
    expect(result.data.find(lead => lead.id === leadA)?.tripId).toBe(ownTrip);
    expect(result.data.find(lead => lead.name === 'Referência inconsistente')?.tripId).toBeNull();
    expect(JSON.stringify(result)).not.toContain(foreignTrip);
    expect(JSON.stringify(result)).toContain('nota privada');
    expect(JSON.stringify(result)).not.toMatch(/Contato B|Legado sem agência|histórico privado/);
    expect((await fetch(`${base}/${orgA}/tourism/leads?limit=101`, { headers: headers(ownerToken) })).status).toBe(400);
  });
  it('nega IDs de outra agência e revoga o acesso imediatamente', async () => {
    expect((await fetch(`${base}/${orgA}/tourism/leads/${leadA}`, { headers: headers(ownerToken) })).status).toBe(200);
    expect((await fetch(`${base}/${orgA}/tourism/leads/${leadB}`, { headers: headers(ownerToken) })).status).toBe(404);
    const other = await (await fetch(`${base}/${orgB}/tourism/leads`, { headers: headers(ownerToken) })).json() as { data: { id: string }[] };
    expect(other.data.map(item => item.id)).toEqual([leadB]);
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'REVOKED' } });
    expect((await fetch(`${base}/${orgA}/tourism/leads`, { headers: headers(ownerToken) })).status).toBe(403);
    expect((await fetch(`${base}/${orgA}/tourism/leads/${leadA}`, { headers: headers(ownerToken) })).status).toBe(403);
    expect((await fetch(`${base}/${orgB}/tourism/leads/${leadB}`, { headers: headers(ownerToken) })).status).toBe(200);
  });
});
