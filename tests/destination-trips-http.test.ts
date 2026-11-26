import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { groupOutingsAsTrip } from '../src/services/destinationTrips.js';

// Viagem com vários destinos e situação da saída: valores registrados uma vez
// (na principal), paradas sem valores, nada apagado ao juntar/separar, nada
// "realizado" sem confirmação e nada de outra empresa exposto.

const prisma = new PrismaClient();
const TAG = `destination-trips-test:${Date.now()}`;
const SITE = 'Registrada a partir do mapa do site.';
let server: Server;
let baseUrl: string;
let token: string;
let userId: string;
let orgId: string;
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

const call = async (path: string, method = 'GET', body?: unknown) => {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
};
const finance = async (year: number | 'all' = 'all') => (await call(`/finance/summary?year=${year}`)).body.outings;
const makeDestination = (name: string, outings: Array<Record<string, unknown>> = [], organizationId: string | null = null) =>
  prisma.destination.create({ data: { name, organizationId, nameSearch: name.toLowerCase(), outings: { create: outings } }, include: { outings: true } });

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const user = await prisma.user.create({ data: { email: `test:${TAG}@example.com`, passwordHash: 'unused', role: 'admin', legacyAccess: true } });
  userId = user.id;
  token = generateToken(user);
  orgId = (await prisma.organization.create({ data: { name: `${TAG}:org`, slug: `${TAG}-org` } })).id;
});

afterAll(async () => {
  await prisma.destinationOuting.updateMany({ where: { destination: { name: { startsWith: TAG } } }, data: { parentOutingId: null } });
  await prisma.destination.deleteMany({ where: { OR: [{ name: { startsWith: TAG } }, { organizationId: orgId }] } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('viagem com vários destinos', () => {
  it('agrupa os três pontos de 15/08/2026 numa viagem, sem marcar realizada, e conta uma vez depois de confirmada', async () => {
    const names = [`${TAG} Dique de Cabedelo`, `${TAG} Fortaleza de Santa Catarina`, `${TAG} Praia Formosa`];
    const dique = await makeDestination(names[0], [{ date: day('2026-08-15'), notes: SITE }]);
    const fortaleza = await makeDestination(names[1], [{ date: day('2026-08-15'), notes: SITE, passengers: 22, pricePerPersonCents: 7000, transportCostCents: 90000 }]);
    const formosa = await makeDestination(names[2], [{ date: day('2026-08-15'), notes: SITE }]);
    const ids = [dique, fortaleza, formosa].map((row) => row.outings[0].id);

    // Antes: os três são "a confirmar" e nenhum entra nos totais.
    let summary = await finance(2026);
    expect(summary.toConfirm.filter((row: { id: string }) => ids.includes(row.id))).toHaveLength(3);
    expect(summary.outings.some((row: { id: string }) => ids.includes(row.id))).toBe(false);

    // Simulação não grava; a principal é a que tem valores.
    const dry = await prisma.$transaction((tx) => groupOutingsAsTrip(tx, '2026-08-15', names, false));
    expect(dry).toMatchObject({ primary: { destination: names[1] }, problems: [], create: [] });
    expect(dry.link.map((item) => item.destination)).toEqual([names[0], names[2]]);
    expect(await prisma.destinationOuting.count({ where: { id: { in: ids }, parentOutingId: { not: null } } })).toBe(0);

    const applied = await prisma.$transaction((tx) => groupOutingsAsTrip(tx, '2026-08-15', names, true));
    expect(applied.problems).toEqual([]);
    const again = await prisma.$transaction((tx) => groupOutingsAsTrip(tx, '2026-08-15', names, true));
    expect(again).toMatchObject({ link: [], create: [], alreadyGrouped: [names[0], names[2]], problems: [] });
    // Nada apagado; principal intacta e ainda sem status.
    const rows = await prisma.destinationOuting.findMany({ where: { id: { in: ids } } });
    expect(rows).toHaveLength(3);
    const primary = rows.find((row) => row.id === ids[1])!;
    expect(primary).toMatchObject({ status: null, parentOutingId: null, passengers: 22, pricePerPersonCents: 7000, transportCostCents: 90000 });
    expect(rows.filter((row) => row.parentOutingId === primary.id)).toHaveLength(2);

    summary = await finance(2026);
    const pending = summary.toConfirm.filter((row: { id: string }) => ids.includes(row.id));
    expect(pending).toHaveLength(1);
    expect(pending[0].stops.map((stop: { destinationName: string }) => stop.destinationName).sort()).toEqual([names[0], names[2]].sort());

    // Parada não aceita situação nem valores.
    expect((await call(`/destinations/${dique.id}/outings/${ids[0]}`, 'PUT', { passengers: 5 })).status).toBe(400);
    expect((await call(`/destinations/${dique.id}/outings/${ids[0]}`, 'PUT', { status: 'REALIZED' })).status).toBe(400);
    expect((await call(`/destinations/${dique.id}/outings/${ids[0]}`, 'PUT', { notes: 'Ponto da manhã.' })).status).toBe(200);

    // A equipe confirma na principal: entra uma vez, com o nome dos três.
    const confirmed = await call(`/destinations/${fortaleza.id}/outings/${ids[1]}`, 'PUT', { status: 'REALIZED' });
    expect(confirmed.status).toBe(200);
    summary = await finance(2026);
    const counted = summary.outings.filter((row: { id: string }) => ids.includes(row.id));
    expect(counted).toHaveLength(1);
    expect(counted[0]).toMatchObject({ id: ids[1], status: 'REALIZED', statusConfirmed: true, revenueCents: 154000, expenseCents: 90000 });
    const ranked = summary.byDestination.find((row: { destinationIds: string[] }) => row.destinationIds.includes(dique.id));
    expect(ranked).toMatchObject({ outings: 1, resultCents: 64000 });
    expect(ranked.name.split(' + ').sort()).toEqual([...names].sort());

    // Os três destinos aparecem no histórico (paradas seguem a principal).
    const visited = (await call(`/destinations?visited=true&search=${encodeURIComponent(TAG)}&limit=100`)).body.data.map((row: { id: string }) => row.id);
    expect(visited).toEqual(expect.arrayContaining([dique.id, fortaleza.id, formosa.id]));
    const stopView = (await call(`/destinations/${dique.id}`)).body.outings[0];
    expect(stopView).toMatchObject({ effectiveStatus: 'REALIZED', revenueCents: null, trip: { role: 'stop', primaryOutingId: ids[1] } });

    // Excluir a principal (ou o destino dela) com paradas é recusado.
    expect((await call(`/destinations/${fortaleza.id}/outings/${ids[1]}`, 'DELETE')).status).toBe(409);
    expect((await call(`/destinations/${fortaleza.id}`, 'DELETE')).status).toBe(409);

    // Separar não duplica: a parada volta sem valores.
    const detached = await call(`/destinations/${fortaleza.id}/outings/${ids[1]}/stops/${ids[2]}`, 'DELETE');
    expect(detached.status).toBe(200);
    const formosaRow = await prisma.destinationOuting.findUnique({ where: { id: ids[2] } });
    expect(formosaRow).toMatchObject({ parentOutingId: null, status: 'REALIZED', passengers: null, pricePerPersonCents: null });
    summary = await finance(2026);
    expect(summary.outings.filter((row: { id: string; revenueCents: number | null }) => ids.includes(row.id) && row.revenueCents !== null)).toHaveLength(1);
    // E pode voltar à viagem.
    // E pode voltar à viagem (a situação herdada é igual à da principal).
    expect((await call(`/destinations/${fortaleza.id}/outings/${ids[1]}/stops`, 'POST', { outingId: ids[2] })).status).toBe(201);
    expect(await prisma.destinationOuting.findUnique({ where: { id: ids[2] } })).toMatchObject({ parentOutingId: ids[1], status: null });
  });

  it('junta só quando os valores da parada estão em branco ou iguais aos da principal', async () => {
    const a = await makeDestination(`${TAG} A`, [{ date: day('2025-06-01'), status: 'REALIZED', passengers: 10, pricePerPersonCents: 5000, transportCostCents: 20000 }]);
    const b = await makeDestination(`${TAG} B`, [{ date: day('2025-06-01'), passengers: 12 }]);
    const c = await makeDestination(`${TAG} C`, [{ date: day('2025-06-01'), status: 'REALIZED', passengers: 10, pricePerPersonCents: 5000 }]);
    const d = await makeDestination(`${TAG} D`);
    const [pa, pb, pc] = [a, b, c].map((row) => row.outings[0].id);

    const conflict = await call(`/destinations/${a.id}/outings/${pa}/stops`, 'POST', { outingId: pb });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error ?? conflict.body.message).toMatch(/passageiros/);
    expect(await prisma.destinationOuting.findUnique({ where: { id: pb } })).toMatchObject({ parentOutingId: null, passengers: 12 });

    // Iguais: ficam só na principal e a nota registra isso.
    expect((await call(`/destinations/${a.id}/outings/${pa}/stops`, 'POST', { outingId: pc })).status).toBe(201);
    expect(await prisma.destinationOuting.findUnique({ where: { id: pc } })).toMatchObject({ parentOutingId: pa, status: null, passengers: null, pricePerPersonCents: null, notes: expect.stringMatching(/valores iguais/) });
    // Destino sem saída: ganha parada sem valores, no dia da principal.
    const added = await call(`/destinations/${a.id}/outings/${pa}/stops`, 'POST', { destinationId: d.id });
    expect(added.status).toBe(201);
    expect(await prisma.destinationOuting.findFirst({ where: { destinationId: d.id } })).toMatchObject({ parentOutingId: pa, date: day('2025-06-01'), passengers: null });
    expect((await call(`/destinations/${a.id}/outings/${pa}/stops`, 'POST', { destinationId: d.id })).status).toBe(409);
    // Uma parada não vira principal nem é ligada a outra viagem.
    expect((await call(`/destinations/${c.id}/outings/${pc}/stops`, 'POST', { destinationId: b.id })).status).toBe(400);
    expect((await call(`/destinations/${b.id}/outings/${pb}/stops`, 'POST', { outingId: pc })).status).toBe(409);

    const all = await finance('all');
    expect(all.outings.filter((row: { id: string }) => [pa, pc].includes(row.id)).map((row: { id: string }) => row.id)).toEqual([pa]);
  });

  it('valida a situação: realizada não pode ser futura; cancelada e planejada ficam fora dos totais', async () => {
    const place = await makeDestination(`${TAG} Situação`);
    expect((await call(`/destinations/${place.id}/outings`, 'POST', { date: '2099-01-01', status: 'REALIZED' })).status).toBe(400);
    const created = await call(`/destinations/${place.id}/outings`, 'POST', { date: '2025-07-01', status: 'CANCELLED', passengers: 10, pricePerPersonCents: 1000, transportCostCents: 0 });
    expect(created.status).toBe(201);
    const outingId = created.body.outings[0].id;
    expect(created.body.outings[0]).toMatchObject({ status: 'CANCELLED', effectiveStatus: 'CANCELLED', statusConfirmed: true });
    let all = await finance('all');
    expect(all.outings.some((row: { id: string }) => row.id === outingId)).toBe(false);
    // Só cancelada: o destino não conta como visitado.
    const visited = (await call(`/destinations?visited=true&search=${encodeURIComponent(`${TAG} Situação`)}`)).body.data;
    expect(visited).toEqual([]);
    expect((await call(`/destinations/${place.id}/outings/${outingId}`, 'PUT', { status: 'REALIZED' })).status).toBe(200);
    all = await finance('all');
    expect(all.outings.find((row: { id: string }) => row.id === outingId)).toMatchObject({ status: 'REALIZED', revenueCents: 10000 });
    expect((await call(`/destinations/${place.id}/outings/${outingId}`, 'PUT', { date: '2099-02-02' })).status).toBe(400);
  });

  it('não liga nem expõe saídas de outra empresa', async () => {
    const own = await makeDestination(`${TAG} Própria`, [{ date: day('2025-08-01'), status: 'REALIZED', passengers: 5, pricePerPersonCents: 1000, transportCostCents: 0 }]);
    const foreign = await makeDestination(`${TAG} Alheia`, [{ date: day('2025-08-01') }], orgId);
    const foreignOuting = foreign.outings[0].id;
    expect((await call(`/destinations/${own.id}/outings/${own.outings[0].id}/stops`, 'POST', { outingId: foreignOuting })).status).toBe(404);
    expect((await call(`/destinations/${own.id}/outings/${own.outings[0].id}/stops`, 'POST', { destinationId: foreign.id })).status).toBe(404);

    // Vínculo cruzado gravado fora da API: falha fechada, sem nome da outra empresa.
    await prisma.destinationOuting.update({ where: { id: foreignOuting }, data: { parentOutingId: own.outings[0].id } });
    const view = (await call(`/destinations/${own.id}`)).body;
    expect(view.outings[0].trip).toBeNull();
    expect(JSON.stringify(view)).not.toContain('Alheia');
    const all = await finance('all');
    expect(JSON.stringify(all)).not.toContain('Alheia');
    await prisma.destinationOuting.update({ where: { id: foreignOuting }, data: { parentOutingId: null } });
  });
});
