import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';
let server: Server, base: string, adminToken: string, userToken: string;
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
beforeAll(async () => {
  const admin = await prisma.user.create({ data: { email: 'lead-test-admin@example.test', passwordHash: 'test', role: 'admin' } });
  const user = await prisma.user.create({ data: { email: 'lead-test-user@example.test', passwordHash: 'test', role: 'user' } });
  adminToken = generateToken(admin); userToken = generateToken(user);
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/leads`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); });
describe('CRM de interessados', () => {
  it('protege dados, valida entrada e permite acompanhar e excluir contatos', async () => {
    expect((await fetch(base)).status).toBe(401);
    expect((await fetch(base, { headers: headers(userToken) })).status).toBe(403);
    expect((await fetch(base, { method: 'POST', headers: headers(adminToken), body: JSON.stringify({ name: '' }) })).status).toBe(400);
    const create = await fetch(base, { method: 'POST', headers: headers(adminToken), body: JSON.stringify({ name: 'Pessoa de teste', stage: 'NEW', phone: '123', responsible: 'Equipe' }) });
    expect(create.status).toBe(201); expect(create.headers.get('cache-control')).toBe('no-store');
    const lead = await create.json() as { id: string };
    expect((await fetch(`${base}/${lead.id}`, { method: 'PUT', headers: headers(adminToken), body: JSON.stringify({ stage: 'NEGOTIATING' }) })).status).toBe(200);
    expect((await fetch(`${base}/${lead.id}/events`, { method: 'POST', headers: headers(adminToken), body: JSON.stringify({ body: 'Contato registrado' }) })).status).toBe(201);
    const detail = await (await fetch(`${base}/${lead.id}`, { headers: headers(adminToken) })).json() as { stage: string; name: string; events: { body: string }[] };
    expect(detail.stage).toBe('NEGOTIATING'); expect(detail.name).toBe('Pessoa de teste'); expect(detail.events[0].body).toBe('Contato registrado');
    const list = await (await fetch(`${base}?stage=NEGOTIATING`, { headers: headers(adminToken) })).json() as { data: unknown[] };
    expect(list.data).toHaveLength(1);
    expect((await fetch(`${base}/${lead.id}`, { method: 'DELETE', headers: headers(adminToken) })).status).toBe(204);
    expect(await prisma.leadEvent.count({ where: { leadId: lead.id } })).toBe(0);
    expect((await fetch(`${base}/${lead.id}`, { headers: headers(adminToken) })).status).toBe(404);
  });
});
