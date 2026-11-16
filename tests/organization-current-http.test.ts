import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/platformApp.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server;
let base: string;
let adminToken: string;
let otherToken: string;
let activeId: string;
let inactiveId: string;
let userId: string;
let otherId: string;
const headers = (token: string, organizationId?: string) => ({
  Authorization: `Bearer ${token}`,
  ...(organizationId ? { 'X-Organization-Id': organizationId } : {}),
});

beforeAll(async () => {
  const admin = await prisma.user.create({ data: { email: 'org-current-a@example.test', passwordHash: 'test', role: 'admin' } });
  const other = await prisma.user.create({ data: { email: 'org-current-b@example.test', passwordHash: 'test', role: 'user' } });
  userId = admin.id; otherId = other.id;
  adminToken = generateToken(admin); otherToken = generateToken(other);
  const active = await prisma.organization.create({ data: { name: 'Pousada A', slug: 'org-current-a', niche: 'pousada' } });
  const inactive = await prisma.organization.create({ data: { name: 'Restaurante B', slug: 'org-current-b', niche: 'restaurante', status: 'INACTIVE' } });
  activeId = active.id; inactiveId = inactive.id;
  await prisma.membership.create({ data: { userId, organizationId: activeId, role: 'staff' } });
  await prisma.membership.create({ data: { userId, organizationId: inactiveId, role: 'owner' } });
  await prisma.membership.create({ data: { userId: otherId, organizationId: activeId, role: 'owner' } });
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.organization.deleteMany({ where: { id: { in: [activeId, inactiveId].filter(Boolean) } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId].filter(Boolean) } } });
  await prisma.$disconnect();
});

describe('contexto autenticado de empresa', () => {
  it('lista vínculos ativos e valida identidade, seleção e papel no servidor', async () => {
    const anonymous = await fetch(`${base}/current`);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('cache-control')).toContain('no-store');
    expect((await fetch(`${base}/current`, { headers: headers(adminToken) })).status).toBe(400);
    expect((await fetch(`${base}/current`, { headers: headers(adminToken, 'invalid.id') })).status).toBe(400);
    expect((await fetch(`${base}/current`, { headers: headers(adminToken, inactiveId) })).status).toBe(403);

    const listing = await fetch(base, { headers: headers(adminToken) });
    expect(listing.status).toBe(200);
    expect((await listing.json() as { organizations: { id: string }[] }).organizations.map(item => item.id)).toEqual([activeId]);
    const current = await fetch(`${base}/current`, { headers: headers(adminToken, activeId) });
    expect(current.status).toBe(200);
    expect(current.headers.get('cache-control')).toContain('no-store');
    expect(await current.json()).toEqual({ organization: { id: activeId, name: 'Pousada A', slug: 'org-current-a', niche: 'pousada', role: 'staff' } });
    const other = await fetch(`${base}/current`, { headers: headers(otherToken, activeId) });
    expect((await other.json() as { organization: { role: string } }).organization.role).toBe('owner');
  });

  it('recusa imediatamente vínculo removido e empresa desativada', async () => {
    await prisma.membership.delete({ where: { userId_organizationId: { userId: otherId, organizationId: activeId } } });
    expect((await fetch(`${base}/current`, { headers: headers(otherToken, activeId) })).status).toBe(403);
    await prisma.organization.update({ where: { id: activeId }, data: { status: 'INACTIVE' } });
    expect((await fetch(`${base}/current`, { headers: headers(adminToken, activeId) })).status).toBe(403);
    const listing = await (await fetch(base, { headers: headers(adminToken) })).json() as { organizations: unknown[] };
    expect(listing.organizations).toEqual([]);
  });
});
