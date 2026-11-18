import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server; let base: string; let userId: string; let token: string; let orgA: string; let orgB: string; let visitA: string; let visitB: string; let cross: string;
const headers = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: 'org-visits-member@example.test', passwordHash: 'unused', role: 'editor' } });
  userId = user.id; token = generateToken(user);
  orgA = (await prisma.organization.create({ data: { name: 'Agência A', slug: 'org-visits-a' } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência B', slug: 'org-visits-b' } })).id;
  await prisma.membership.create({ data: { userId, organizationId: orgA, role: 'MEMBER' } });
  const trip = await prisma.trip.create({ data: { organizationId: orgB, title: 'Viagem estrangeira', category: 'Teste', description: 'privado', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'leve', includes: '[]', media: '[]', storedIdentity: 'org-visits-foreign-trip' } });
  visitA = (await prisma.visit.create({ data: { organizationId: orgA, title: 'Praia azul', titleSearch: 'praia azul', city: 'Cidade', region: 'PB', storedIdentity: 'org-visits-a', needsReview: true, notes: 'nota privada' } })).id;
  visitB = (await prisma.visit.create({ data: { organizationId: orgB, title: 'Praia estrangeira', titleSearch: 'praia estrangeira', city: 'Cidade', region: 'PB', storedIdentity: 'org-visits-b' } })).id;
  cross = (await prisma.visit.create({ data: { organizationId: orgA, tripId: trip.id, title: 'Vínculo inconsistente', titleSearch: 'vinculo inconsistente', city: 'Cidade', region: 'PB', storedIdentity: 'org-visits-cross' } })).id;
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.visit.deleteMany({ where: { id: { in: [visitA, visitB, cross] } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: 'org-visits-foreign-trip' } });
  await prisma.membership.deleteMany({ where: { userId } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('consulta de destinos da empresa', () => {
  it('exige sessão, permite membro, filtra busca e não revela notas, dados estrangeiros ou vínculo inconsistente', async () => {
    expect((await fetch(`${base}/${orgA}/tourism/visits`)).status).toBe(401);
    const response = await fetch(`${base}/${orgA}/tourism/visits?search=PRAIA&needsReview=true`, { headers: headers() });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json() as { data: Array<{ id: string }>; pagination: { total: number } };
    expect(body.data.map(item => item.id)).toEqual([visitA]);
    expect(body.pagination.total).toBe(1);
    expect(JSON.stringify(body)).not.toContain('nota privada');
    expect((await fetch(`${base}/${orgA}/tourism/visits/${visitB}`, { headers: headers() })).status).toBe(404);
    expect((await fetch(`${base}/${orgA}/tourism/visits/${cross}`, { headers: headers() })).status).toBe(404);
    expect((await fetch(`${base}/${orgA}/tourism/visits?hasCoords=false`, { headers: headers() })).status).toBe(200);
    expect((await fetch(`${base}/${orgA}/tourism/visits?hasCoords=invalid`, { headers: headers() })).status).toBe(400);
  });

  it('revalida desativação do vínculo e da empresa', async () => {
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId } }, data: { status: 'REVOKED' } });
    expect((await fetch(`${base}/${orgA}/tourism/visits`, { headers: headers() })).status).toBe(403);
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId } }, data: { status: 'ACTIVE' } });
    await prisma.organization.update({ where: { id: orgA }, data: { status: 'INACTIVE' } });
    expect((await fetch(`${base}/${orgA}/tourism/visits/${visitA}`, { headers: headers() })).status).toBe(403);
  });
});
