import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';
let server: Server, base: string, adminToken: string, userToken: string;
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const todayInSaoPaulo = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${date.year}-${date.month}-${date.day}`;
};
beforeAll(async () => {
  const admin = await prisma.user.create({ data: { email: 'lead-test-admin@example.test', passwordHash: 'test', role: 'admin' } });
  const user = await prisma.user.create({ data: { email: 'lead-test-user@example.test', passwordHash: 'test', role: 'user' } });
  adminToken = generateToken(admin); userToken = generateToken(user);
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/leads`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); });
describe('CRM de interessados', () => {
  it('busca nome e pagina somente interessados sem viagem ou associados à viagem selecionada', async () => {
    const suffix = `${Date.now()}`;
    const tripData = { category: 'Teste', description: 'Teste', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'light', includes: '[]', media: '[]' };
    const first = await prisma.trip.create({ data: { ...tripData, title: 'Primeira', storedIdentity: `lead-filter-a-${suffix}` } });
    const second = await prisma.trip.create({ data: { ...tripData, title: 'Segunda', storedIdentity: `lead-filter-b-${suffix}` } });
    const created = await Promise.all([
      prisma.lead.create({ data: { name: `Consulta ${suffix} livre` } }),
      prisma.lead.create({ data: { name: `Consulta ${suffix} vinculada`, tripId: first.id } }),
      prisma.lead.create({ data: { name: `Consulta ${suffix} outra`, tripId: second.id } }),
      prisma.lead.create({ data: { name: `Outro nome ${suffix}`, tripId: first.id } }),
    ]);
    try {
      const params = new URLSearchParams({ search: `Consulta ${suffix}`, eligibleTripId: first.id, page: '1', limit: '1' });
      const fetchPage = async () => (await (await fetch(`${base}?${params}`, { headers: headers(adminToken) })).json()) as { data: { id: string }[]; pagination: { total: number; totalPages: number } };
      const page1 = await fetchPage();
      params.set('page', '2');
      const page2 = await fetchPage();
      expect(page1.pagination).toMatchObject({ total: 2, totalPages: 2 });
      expect(new Set([...page1.data, ...page2.data].map(item => item.id))).toEqual(new Set([created[0].id, created[1].id]));
      params.set('tripId', first.id);
      params.set('page', '1');
      const exact = await fetchPage();
      expect(exact.pagination.total).toBe(1);
      expect(exact.data[0].id).toBe(created[1].id);
      expect((await fetch(`${base}?search=${'a'.repeat(121)}`, { headers: headers(adminToken) })).status).toBe(400);
    } finally {
      await prisma.lead.deleteMany({ where: { id: { in: created.map(item => item.id) } } });
      await prisma.trip.deleteMany({ where: { id: { in: [first.id, second.id] } } });
    }
  });
  it('protege dados, valida entrada e permite acompanhar e excluir contatos', async () => {
    expect((await fetch(base)).status).toBe(401);
    expect((await fetch(base, { headers: headers(userToken) })).status).toBe(403);
    expect((await fetch(base, { method: 'POST', headers: headers(adminToken), body: JSON.stringify({ name: '' }) })).status).toBe(400);
    const create = await fetch(base, { method: 'POST', headers: headers(adminToken), body: JSON.stringify({ name: 'Pessoa de teste', stage: 'NEW', phone: '123', responsible: 'Equipe', nextFollowUpAt: `${todayInSaoPaulo()}T12:00:00.000Z` }) });
    expect(create.status).toBe(201); expect(create.headers.get('cache-control')).toBe('no-store');
    const lead = await create.json() as { id: string };
    const futureDate = new Date(`${todayInSaoPaulo()}T12:00:00.000Z`);
    futureDate.setUTCDate(futureDate.getUTCDate() + 2);
    const future = await fetch(base, { method: 'POST', headers: headers(adminToken), body: JSON.stringify({ name: 'Contato futuro', stage: 'NEW', nextFollowUpAt: futureDate.toISOString() }) });
    expect(future.status).toBe(201);
    const overdueDate = new Date(`${todayInSaoPaulo()}T12:00:00.000Z`);
    overdueDate.setUTCDate(overdueDate.getUTCDate() - 1);
    const overdue = await fetch(base, { method: 'POST', headers: headers(adminToken), body: JSON.stringify({ name: 'Contato vencido', stage: 'NEW', nextFollowUpAt: overdueDate.toISOString() }) });
    expect(overdue.status).toBe(201);
    const overdueLead = await overdue.json() as { id: string };
    const pending = await (await fetch(`${base}?stage=NEW&followUp=due`, { headers: headers(adminToken) })).json() as { data: { id: string }[] };
    expect(pending.data.map(item => item.id)).toEqual([overdueLead.id, lead.id]);
    expect((await fetch(`${base}?followUp=invalid`, { headers: headers(adminToken) })).status).toBe(400);
    const futureLead = await future.json() as { id: string };
    await prisma.lead.delete({ where: { id: futureLead.id } });
    await prisma.lead.delete({ where: { id: overdueLead.id } });
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
