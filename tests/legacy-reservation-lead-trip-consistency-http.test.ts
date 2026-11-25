import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';

// Achado de revisão: legacyReservationFilterWithConsistentRelations checava a
// ORGANIZAÇÃO do lead vinculado à reserva, mas não a VIAGEM do próprio lead —
// nem que essa viagem fosse a mesma da reserva. Uma reserva no escopo, com
// lead no escopo, ainda podia expor/alterar um lead cuja viagem é de outra
// empresa, ou cuja viagem (mesmo dentro do escopo) é diferente da viagem da
// reserva. Este arquivo cobre especificamente essa consistência transitiva
// reserva.tripId <-> lead.tripId.

const prisma = new PrismaClient();
const TAG = `legacy-res-lead-trip-test:${Date.now()}`;

let server: Server;
let baseUrl: string;
let token: string;
let userId: string;
let orgAId: string;
let tripLegacy1Id: string;
let tripLegacy2Id: string;
let tripOrgAId: string;
let leadForeignTripId: string;
let leadDifferentTripId: string;
let leadConsistentId: string;
let leadNoTripId: string;
let resLeadForeignTripId: string;
let resLeadDifferentTripId: string;
let resConsistentId: string;
let resNoLeadId: string;
let resLeadNoTripId: string;

const authed = (extra: RequestInit = {}) => ({ ...extra, headers: { Authorization: `Bearer ${token}`, ...(extra.headers || {}) } });
const json = (method: string, body: unknown) => ({
  method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

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

const makeLead = (tripId: string | null, label: string) => prisma.lead.create({
  data: { organizationId: null, tripId, name: `${TAG}:${label}` },
});

const makeReservation = (tripId: string, leadId: string | null) => prisma.reservation.create({
  data: { organizationId: null, tripId, leadId, customerName: TAG, seats: 1, totalCents: 1000 },
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

  const [tripLegacy1, tripLegacy2, tripOrgA] = await Promise.all([
    makeTrip(null, 'legacy-1'),
    makeTrip(null, 'legacy-2'),
    makeTrip(orgAId, 'org-a'),
  ]);
  tripLegacy1Id = tripLegacy1.id;
  tripLegacy2Id = tripLegacy2.id;
  tripOrgAId = tripOrgA.id;

  const [leadForeignTrip, leadDifferentTrip, leadConsistent, leadNoTrip] = await Promise.all([
    makeLead(tripOrgAId, 'lead-foreign-trip'), // lead no escopo (organizationId null), mas vinculado à viagem de outra empresa
    makeLead(tripLegacy2Id, 'lead-different-trip'), // lead no escopo, viagem no escopo, mas é OUTRA viagem (não a da reserva)
    makeLead(tripLegacy1Id, 'lead-consistente'), // mesma viagem da reserva
    makeLead(null, 'lead-sem-viagem'),
  ]);
  leadForeignTripId = leadForeignTrip.id;
  leadDifferentTripId = leadDifferentTrip.id;
  leadConsistentId = leadConsistent.id;
  leadNoTripId = leadNoTrip.id;

  const [resLeadForeignTrip, resLeadDifferentTrip, resConsistent, resNoLead, resLeadNoTrip] = await Promise.all([
    makeReservation(tripLegacy1Id, leadForeignTripId),
    makeReservation(tripLegacy1Id, leadDifferentTripId),
    makeReservation(tripLegacy1Id, leadConsistentId),
    makeReservation(tripLegacy1Id, null),
    makeReservation(tripLegacy1Id, leadNoTripId),
  ]);
  resLeadForeignTripId = resLeadForeignTrip.id;
  resLeadDifferentTripId = resLeadDifferentTrip.id;
  resConsistentId = resConsistent.id;
  resNoLeadId = resNoLead.id;
  resLeadNoTripId = resLeadNoTrip.id;
});

afterAll(async () => {
  await prisma.reservationInstallment.deleteMany({ where: { reservation: { customerName: { startsWith: TAG } } } });
  await prisma.reservation.deleteMany({ where: { customerName: { startsWith: TAG } } });
  await prisma.lead.deleteMany({ where: { name: { startsWith: `${TAG}:` } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: `${TAG}:` } } });
  await prisma.organization.deleteMany({ where: { id: orgAId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('consistência transitiva reserva.tripId <-> lead.tripId', () => {
  it('lista filtrada pela viagem da reserva exclui reservas com lead de viagem estrangeira ou diferente', async () => {
    const res = await fetch(`${baseUrl}/api/reservations?tripId=${tripLegacy1Id}`, authed());
    const body = await res.json() as { data: Array<{ id: string }>; pagination: { total: number } };
    const ids = body.data.map((r) => r.id);
    expect(ids).not.toContain(resLeadForeignTripId);
    expect(ids).not.toContain(resLeadDifferentTripId);
    expect(ids).toContain(resConsistentId);
    expect(ids).toContain(resNoLeadId);
    expect(ids).toContain(resLeadNoTripId);
    expect(body.pagination.total).toBe(3);
  });

  it('detalhe: 404 quando o lead vinculado tem viagem estrangeira ou diferente da reserva', async () => {
    expect((await fetch(`${baseUrl}/api/reservations/${resLeadForeignTripId}`, authed())).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/reservations/${resLeadDifferentTripId}`, authed())).status).toBe(404);
  });

  it('detalhe: 200 para reserva sem lead, com lead sem viagem, ou com lead da mesma viagem', async () => {
    expect((await fetch(`${baseUrl}/api/reservations/${resConsistentId}`, authed())).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/reservations/${resNoLeadId}`, authed())).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/reservations/${resLeadNoTripId}`, authed())).status).toBe(200);
  });

  it('PATCH é negado quando o lead vinculado é inconsistente, e não altera o registro', async () => {
    const r1 = await fetch(`${baseUrl}/api/reservations/${resLeadForeignTripId}`, json('PATCH', { customerName: 'Sequestrada' }));
    expect(r1.status).toBe(404);
    const r2 = await fetch(`${baseUrl}/api/reservations/${resLeadDifferentTripId}`, json('PATCH', { customerName: 'Sequestrada' }));
    expect(r2.status).toBe(404);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: resLeadForeignTripId } })).customerName).toBe(TAG);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: resLeadDifferentTripId } })).customerName).toBe(TAG);
  });

  it('PATCH continua funcionando normalmente quando o lead vinculado é consistente', async () => {
    const res = await fetch(`${baseUrl}/api/reservations/${resConsistentId}`, json('PATCH', { customerName: `${TAG}:atualizada` }));
    expect(res.status).toBe(200);
  });

  it('parcelas: 404 ao criar/alterar/excluir quando o lead vinculado é inconsistente', async () => {
    const createUrl = `${baseUrl}/api/reservations/${resLeadDifferentTripId}/installments`;
    expect((await fetch(createUrl, json('POST', { amountCents: 100 }))).status).toBe(404);

    const installment = await prisma.reservationInstallment.create({ data: { reservationId: resLeadDifferentTripId, amountCents: 500 } });
    expect((await fetch(`${createUrl}/${installment.id}`, json('PATCH', { paid: true }))).status).toBe(404);
    expect((await fetch(`${createUrl}/${installment.id}`, authed({ method: 'DELETE' }))).status).toBe(404);
    await prisma.reservationInstallment.delete({ where: { id: installment.id } });
  });

  it('parcelas: continuam funcionando normalmente quando o lead vinculado é consistente', async () => {
    const res = await fetch(`${baseUrl}/api/reservations/${resConsistentId}/installments`, json('POST', { amountCents: 500 }));
    expect(res.status).toBe(201);
    const installment = await res.json() as { id: string };
    await prisma.reservationInstallment.delete({ where: { id: installment.id } });
  });
});
