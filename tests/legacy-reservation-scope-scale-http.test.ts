import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';

// Achado de revisão: a checagem de consistência transitiva reserva<->lead<->
// viagem buscava em memória os IDs de TODAS as reservas que passavam a
// checagem e os reinjetava num `id IN (...)`, crescendo com o banco inteiro —
// risco de superar o limite de parâmetros do SQLite/Prisma numa única
// consulta. A correção move a checagem para EXISTS/JOIN dentro do próprio
// SQLite (reservationAccessWhereSql em legacyTourismScope.ts), de forma que
// nenhuma lista de IDs de outras empresas é materializada na aplicação — a
// consulta de listagem só retorna a PÁGINA pedida (≤ limite) e a contagem é
// um agregado no banco. Este arquivo cria um volume de reservas bem maior
// que uma única página para provar que a paginação, a contagem e a proteção
// contra registros inconsistentes continuam corretas nessa escala, sem
// jamais precisar de uma lista de parâmetros do tamanho da tabela.

const prisma = new PrismaClient();
const TAG = `legacy-res-scale-test:${Date.now()}`;
const VALID_COUNT = 1500;
const PAGE_LIMIT = 100;

let server: Server;
let baseUrl: string;
let token: string;
let userId: string;
let orgAId: string;
let tripLegacyId: string;
let tripLegacy2Id: string;
let tripForeignId: string;
let resBadForeignTripId: string;
let resBadDifferentTripId: string;
let validIds: string[];

const authed = (extra: RequestInit = {}) => ({ ...extra, headers: { Authorization: `Bearer ${token}`, ...(extra.headers || {}) } });

const makeTrip = (organizationId: string | null, label: string) => prisma.trip.create({
  data: {
    organizationId,
    title: `${TAG}:${label}`,
    category: 'Teste',
    description: 'Descrição completa da experiência de teste.',
    city: 'Cidade',
    region: 'PB',
    startDateISO: new Date('2026-12-01T06:00:00-03:00'),
    intensityClass: 'moderado',
    includes: JSON.stringify([]),
    priceValue: 100,
    meetingTBD: true,
    media: JSON.stringify([{ src: 'https://example.com/isolation.jpg', alt: 'Foto da viagem' }]),
    storedIdentity: `${TAG}:${label}`,
  },
});

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const user = await prisma.user.create({
    data: { legacyAccess: true, email: `test:${TAG}@example.com`, passwordHash: 'unused-in-this-test', role: 'admin' },
  });
  userId = user.id;
  token = generateToken(user);

  const orgA = await prisma.organization.create({ data: { name: `${TAG}:A`, slug: `${TAG}-a` } });
  orgAId = orgA.id;

  const [tripLegacy, tripLegacy2, tripForeign] = await Promise.all([
    makeTrip(null, 'legacy-1'),
    makeTrip(null, 'legacy-2'),
    makeTrip(orgAId, 'org-a'),
  ]);
  tripLegacyId = tripLegacy.id;
  tripLegacy2Id = tripLegacy2.id;
  tripForeignId = tripForeign.id;

  const [leadForeignTrip, leadDifferentTrip] = await Promise.all([
    prisma.lead.create({ data: { organizationId: null, tripId: tripForeignId, name: `${TAG}:lead-foreign-trip` } }),
    prisma.lead.create({ data: { organizationId: null, tripId: tripLegacy2Id, name: `${TAG}:lead-different-trip` } }),
  ]);

  // Volume bem acima de uma página (PAGE_LIMIT) para exercitar paginação e
  // garantir que nenhuma consulta precisa de uma lista de parâmetros do
  // tamanho da tabela.
  const batchSize = 300;
  for (let start = 0; start < VALID_COUNT; start += batchSize) {
    const size = Math.min(batchSize, VALID_COUNT - start);
    await prisma.reservation.createMany({
      data: Array.from({ length: size }, (_, i) => ({
        organizationId: null,
        tripId: tripLegacyId,
        leadId: null,
        customerName: `${TAG}:valid-${start + i}`,
        seats: 1,
        totalCents: 1000,
      })),
    });
  }
  validIds = (await prisma.reservation.findMany({ where: { customerName: { startsWith: `${TAG}:valid-` } }, select: { id: true } })).map((r) => r.id);
  expect(validIds.length).toBe(VALID_COUNT);

  const [resBadForeignTrip, resBadDifferentTrip] = await Promise.all([
    prisma.reservation.create({ data: { organizationId: null, tripId: tripLegacyId, leadId: leadForeignTrip.id, customerName: `${TAG}:bad-foreign-trip`, seats: 1, totalCents: 1000 } }),
    prisma.reservation.create({ data: { organizationId: null, tripId: tripLegacyId, leadId: leadDifferentTrip.id, customerName: `${TAG}:bad-different-trip`, seats: 1, totalCents: 1000 } }),
  ]);
  resBadForeignTripId = resBadForeignTrip.id;
  resBadDifferentTripId = resBadDifferentTrip.id;
}, 60_000);

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { customerName: { startsWith: TAG } } });
  await prisma.lead.deleteMany({ where: { name: { startsWith: `${TAG}:` } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: `${TAG}:` } } });
  await prisma.organization.deleteMany({ where: { id: orgAId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}, 60_000);

describe('escala: paginação e contagem sobre um volume bem maior que uma página', () => {
  it('a contagem reflete só os registros consistentes, excluindo os inconsistentes mesmo em meio ao volume', async () => {
    const res = await fetch(`${baseUrl}/api/reservations?tripId=${tripLegacyId}&limit=${PAGE_LIMIT}&page=1`, authed());
    const body = await res.json() as { pagination: { total: number; totalPages: number } };
    expect(body.pagination.total).toBe(VALID_COUNT);
    expect(body.pagination.totalPages).toBe(VALID_COUNT / PAGE_LIMIT);
  }, 30_000);

  it('percorre todas as páginas sem duplicar, sem pular e sem nunca incluir um registro inconsistente', async () => {
    const totalPages = VALID_COUNT / PAGE_LIMIT;
    const collected: string[] = [];
    for (let page = 1; page <= totalPages; page += 1) {
      const res = await fetch(`${baseUrl}/api/reservations?tripId=${tripLegacyId}&limit=${PAGE_LIMIT}&page=${page}`, authed());
      const body = await res.json() as { data: Array<{ id: string }> };
      expect(body.data.length).toBe(PAGE_LIMIT);
      collected.push(...body.data.map((r) => r.id));
    }
    expect(collected.length).toBe(VALID_COUNT);
    expect(new Set(collected).size).toBe(VALID_COUNT);
    expect(collected).not.toContain(resBadForeignTripId);
    expect(collected).not.toContain(resBadDifferentTripId);
    const collectedSet = new Set(collected);
    for (const id of validIds) expect(collectedSet.has(id)).toBe(true);
  }, 60_000);

  it('detalhe: 200 para um registro válido do volume, 404 para os inconsistentes mesmo com o volume presente', async () => {
    expect((await fetch(`${baseUrl}/api/reservations/${validIds[0]}`, authed())).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/reservations/${validIds[validIds.length - 1]}`, authed())).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/reservations/${resBadForeignTripId}`, authed())).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/reservations/${resBadDifferentTripId}`, authed())).status).toBe(404);
  }, 30_000);
});
