import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { prisma } from '../src/lib/prisma.js';

let server: Server;
let base: string;
let token: string;
let userId: string;
let tripId: string;
let otherTripId: string;
const ids: string[] = [];
const prefix = 'Busca-literal-e2e';

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: 'lead-search-admin@example.test', passwordHash: 'test', role: 'admin' } });
  userId = user.id; token = generateToken(user);
  const data = { category: 'Teste', description: 'Teste', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'light', includes: '[]', media: '[]' };
  const first = await prisma.trip.create({ data: { ...data, title: 'Busca A', storedIdentity: 'lead-search-a' } });
  const second = await prisma.trip.create({ data: { ...data, title: 'Busca B', storedIdentity: 'lead-search-b' } });
  tripId = first.id; otherTripId = second.id;
  for (const lead of [
    { name: `${prefix} livre`, phone: '(83) 99991-2233', email: 'unico-contato@example.test', nextFollowUpAt: new Date('2000-01-01T12:00:00Z') },
    { name: `${prefix} viagem`, phone: '(83) 99991-4444', email: null, tripId, nextFollowUpAt: new Date('2000-01-01T12:00:00Z') },
    { name: `${prefix} outra`, phone: '(83) 99991-5555', email: null, tripId: otherTripId, nextFollowUpAt: new Date('2000-01-01T12:00:00Z') },
    { name: `${prefix} futuro`, phone: null, email: null, tripId, nextFollowUpAt: new Date('2099-01-01T12:00:00Z') },
    { name: `${prefix} 100%_literal`, phone: null, email: null },
    { name: `${prefix} JOÃO ÁRVORE AÇÃO`, phone: null, email: null },
  ]) ids.push((await prisma.lead.create({ data: lead })).id);
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/leads`;
});
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.lead.deleteMany({ where: { id: { in: ids } } });
  await prisma.trip.deleteMany({ where: { id: { in: [tripId, otherTripId].filter(Boolean) } } });
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('busca literal privada de interessados', () => {
  const search = async (params: Record<string, string>) => {
    const response = await fetch(`${base}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    return response.json() as Promise<{ data: { id: string }[]; pagination: { total: number; totalPages: number } }>;
  };
  it('encontra nome, telefone ou email sem depender de dados opcionais', async () => {
    expect((await search({ search: '99991-2233' })).data.map(x => x.id)).toEqual([ids[0]]);
    expect((await search({ search: 'UNICO-CONTATO@EXAMPLE.TEST' })).data.map(x => x.id)).toEqual([ids[0]]);
    expect((await search({ search: `${prefix} futuro` })).data.map(x => x.id)).toEqual([ids[3]]);
    expect((await search({ search: 'valor-ausente' })).pagination.total).toBe(0);
    expect((await search({ search: 'joão árvore ação' })).data.map(x => x.id)).toEqual([ids[5]]);
    expect((await search({ search: 'JoÃo Árvore AçÃo' })).data.map(x => x.id)).toEqual([ids[5]]);
    expect((await search({ search: 'joao arvore acao' })).pagination.total).toBe(0);
    expect((await fetch(`${base}?search=99991-2233`)).status).toBe(401);
  });
  it('trata caracteres de LIKE literalmente e combina filtros e paginação', async () => {
    expect((await search({ search: `${prefix} 100%_` })).data.map(x => x.id)).toEqual([ids[4]]);
    expect((await search({ search: `${prefix} %inexistente` })).pagination.total).toBe(0);
    expect((await search({ search: `${prefix} _inexistente` })).pagination.total).toBe(0);
    const filters = { search: prefix, eligibleTripId: tripId, followUp: 'due', stage: 'NEW', limit: '1' };
    const first = await search({ ...filters, page: '1' });
    const second = await search({ ...filters, page: '2' });
    expect(first.pagination).toMatchObject({ total: 2, totalPages: 2 });
    expect(new Set([...first.data, ...second.data].map(x => x.id))).toEqual(new Set([ids[0], ids[1]]));
    const exact = await search({ ...filters, tripId, page: '1' });
    expect(exact.data.map(x => x.id)).toEqual([ids[1]]);
  });
});
