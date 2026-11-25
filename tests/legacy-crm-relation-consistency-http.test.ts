import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { config } from '../src/config.js';

// Cobre o achado da auditoria: Lead/Reservation com organizationId no escopo
// legado (inclusive null) podem ter tripId/leadId apontando para outra
// empresa (FK cruzada permitida pelo schema). Leitura e mutação devem negar
// esses registros inconsistentes sem vazar o ID/título estrangeiro, e nunca
// esconder os registros legados coerentes (sem viagem, ou com viagem/
// interessado do próprio escopo).

const prisma = new PrismaClient();
const TAG = `legacy-crm-consistency-test:${Date.now()}`;

let server: Server;
let baseUrl: string;
let token: string;
let userId: string;
let orgAId: string;
let orgBId: string;
let tripLegacyId: string;
let tripOrgAId: string;
let tripOrgBId: string;
let leadOrgAId: string;
let leadOrgBId: string;
let leadForeignTripAId: string;
let leadForeignTripBId: string;
let leadConsistentId: string;
let leadNoTripId: string;
let resForeignTripAId: string;
let resForeignTripBId: string;
let resForeignLeadId: string;
let resConsistentId: string;

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

const makeLead = (organizationId: string | null, tripId: string | null, label: string) => prisma.lead.create({
  data: { organizationId, tripId, name: `${TAG}:${label}` },
});

const makeReservation = (organizationId: string | null, tripId: string, leadId: string | null) => prisma.reservation.create({
  data: { organizationId, tripId, leadId, customerName: TAG, seats: 1, totalCents: 1000 },
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
  const orgB = await prisma.organization.create({ data: { name: `${TAG}:B`, slug: `${TAG}-b` } });
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [tripLegacy, tripOrgA, tripOrgB] = await Promise.all([
    makeTrip(null, 'legacy'),
    makeTrip(orgAId, 'org-a'),
    makeTrip(orgBId, 'org-b'),
  ]);
  tripLegacyId = tripLegacy.id;
  tripOrgAId = tripOrgA.id;
  tripOrgBId = tripOrgB.id;

  const [leadOrgA, leadOrgB] = await Promise.all([
    makeLead(orgAId, tripOrgAId, 'lead-org-a'),
    makeLead(orgBId, tripOrgBId, 'lead-org-b'),
  ]);
  leadOrgAId = leadOrgA.id;
  leadOrgBId = leadOrgB.id;

  const [leadForeignTripA, leadForeignTripB, leadConsistent, leadNoTrip] = await Promise.all([
    makeLead(null, tripOrgAId, 'lead-foreign-trip-a'), // organizationId null (legado), mas vinculado à viagem da empresa A
    makeLead(null, tripOrgBId, 'lead-foreign-trip-b'), // idem, empresa B
    makeLead(null, tripLegacyId, 'lead-consistente'),
    makeLead(null, null, 'lead-sem-viagem'),
  ]);
  leadForeignTripAId = leadForeignTripA.id;
  leadForeignTripBId = leadForeignTripB.id;
  leadConsistentId = leadConsistent.id;
  leadNoTripId = leadNoTrip.id;

  const [resForeignTripA, resForeignTripB, resForeignLead, resConsistent] = await Promise.all([
    makeReservation(null, tripOrgAId, null), // organizationId null, mas vinculada à viagem da empresa A
    makeReservation(null, tripOrgBId, null), // idem, empresa B
    makeReservation(null, tripLegacyId, leadOrgAId), // trip própria, mas lead da empresa A
    makeReservation(null, tripLegacyId, null),
  ]);
  resForeignTripAId = resForeignTripA.id;
  resForeignTripBId = resForeignTripB.id;
  resForeignLeadId = resForeignLead.id;
  resConsistentId = resConsistent.id;
});

afterAll(async () => {
  config.legacyTourismOrganizationId = null;
  await prisma.reservationInstallment.deleteMany({ where: { reservation: { customerName: { startsWith: TAG } } } });
  await prisma.reservation.deleteMany({ where: { customerName: { startsWith: TAG } } });
  await prisma.leadEvent.deleteMany({ where: { lead: { name: { startsWith: `${TAG}:` } } } });
  await prisma.lead.deleteMany({ where: { name: { startsWith: `${TAG}:` } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: `${TAG}:` } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('leads com relação (tripId) inconsistente são negados, sem vazar a viagem estrangeira', () => {
  it('lista por tripId estrangeiro nunca retorna o lead legado vinculado a ele', async () => {
    const byForeignTripId = await (await fetch(`${baseUrl}/api/leads?tripId=${tripOrgAId}`, authed())).json() as { data: Array<{ id: string }> };
    expect(byForeignTripId.data.map((l) => l.id)).not.toContain(leadForeignTripAId);
  });

  it('detalhe: 404 para lead com trip estrangeira; 200 para leads coerentes (com e sem viagem)', async () => {
    expect((await fetch(`${baseUrl}/api/leads/${leadForeignTripAId}`, authed())).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/leads/${leadForeignTripBId}`, authed())).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/leads/${leadConsistentId}`, authed())).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/leads/${leadNoTripId}`, authed())).status).toBe(200);
  });

  it('PUT é negado em lead com trip estrangeira e não o altera', async () => {
    const res = await fetch(`${baseUrl}/api/leads/${leadForeignTripAId}`, json('PUT', { stage: 'WON' }));
    expect(res.status).toBe(404);
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: leadForeignTripAId } });
    expect(after.stage).toBe('NEW');
  });

  it('PUT continua funcionando normalmente em lead legado coerente', async () => {
    const res = await fetch(`${baseUrl}/api/leads/${leadConsistentId}`, json('PUT', { stage: 'CONTACTED' }));
    expect(res.status).toBe(200);
  });

  it('eventos: 404 em lead com trip estrangeira; 201 em lead coerente', async () => {
    expect((await fetch(`${baseUrl}/api/leads/${leadForeignTripAId}/events`, json('POST', { body: 'tentativa' }))).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/leads/${leadConsistentId}/events`, json('POST', { body: 'contato real' }))).status).toBe(201);
  });

  it('DELETE é negado em lead com trip estrangeira e não o exclui', async () => {
    const res = await fetch(`${baseUrl}/api/leads/${leadForeignTripBId}`, authed({ method: 'DELETE' }));
    expect(res.status).toBe(404);
    expect(await prisma.lead.findUnique({ where: { id: leadForeignTripBId } })).not.toBeNull();
  });
});

describe('reservas com relação (trip ou lead) inconsistente são negadas, sem vazar o registro estrangeiro', () => {
  it('lista por tripId estrangeiro nunca retorna a reserva legada vinculada a ele', async () => {
    const byForeignTripId = await (await fetch(`${baseUrl}/api/reservations?tripId=${tripOrgAId}`, authed())).json() as { data: Array<{ id: string }> };
    expect(byForeignTripId.data.map((r) => r.id)).not.toContain(resForeignTripAId);
  });

  it('detalhe: 404 para reserva com trip estrangeira ou lead estrangeiro; 200 para reserva coerente', async () => {
    expect((await fetch(`${baseUrl}/api/reservations/${resForeignTripAId}`, authed())).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/reservations/${resForeignTripBId}`, authed())).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/reservations/${resForeignLeadId}`, authed())).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/reservations/${resConsistentId}`, authed())).status).toBe(200);
  });

  it('PATCH é negado em reserva com trip estrangeira ou lead estrangeiro, e não as altera', async () => {
    const r1 = await fetch(`${baseUrl}/api/reservations/${resForeignTripAId}`, json('PATCH', { customerName: 'Sequestrada' }));
    expect(r1.status).toBe(404);
    const r2 = await fetch(`${baseUrl}/api/reservations/${resForeignLeadId}`, json('PATCH', { customerName: 'Sequestrada' }));
    expect(r2.status).toBe(404);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: resForeignTripAId } })).customerName).toBe(TAG);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: resForeignLeadId } })).customerName).toBe(TAG);
  });

  it('PATCH continua funcionando normalmente em reserva legada coerente', async () => {
    const res = await fetch(`${baseUrl}/api/reservations/${resConsistentId}`, json('PATCH', { customerName: `${TAG}:atualizada` }));
    expect(res.status).toBe(200);
  });

  it('parcelas: 404 ao criar/alterar/excluir em reserva com trip estrangeira', async () => {
    const createUrl = `${baseUrl}/api/reservations/${resForeignTripAId}/installments`;
    expect((await fetch(createUrl, json('POST', { amountCents: 100 }))).status).toBe(404);

    const installment = await prisma.reservationInstallment.create({ data: { reservationId: resForeignTripAId, amountCents: 500 } });
    expect((await fetch(`${createUrl}/${installment.id}`, json('PATCH', { paid: true }))).status).toBe(404);
    expect((await fetch(`${createUrl}/${installment.id}`, authed({ method: 'DELETE' }))).status).toBe(404);
    await prisma.reservationInstallment.delete({ where: { id: installment.id } });
  });

  it('parcelas: continuam funcionando normalmente em reserva legada coerente', async () => {
    const res = await fetch(`${baseUrl}/api/reservations/${resConsistentId}/installments`, json('POST', { amountCents: 500 }));
    expect(res.status).toBe(201);
    const installment = await res.json() as { id: string };
    await prisma.reservationInstallment.delete({ where: { id: installment.id } });
  });
});

describe('com LEGACY_TOURISM_ORGANIZATION_ID configurado, a inconsistência passa a depender da organização configurada', () => {
  it('registros vinculados à organização configurada tornam-se consistentes; os de outra empresa continuam negados', async () => {
    config.legacyTourismOrganizationId = orgAId;
    try {
      // leadForeignTripA referenciava a viagem da empresa A: agora que A está no
      // escopo, lead e viagem estão ambos no mesmo escopo unificado.
      expect((await fetch(`${baseUrl}/api/leads/${leadForeignTripAId}`, authed())).status).toBe(200);
      // leadForeignTripB referencia a viagem da empresa B, que não foi configurada: continua negado.
      expect((await fetch(`${baseUrl}/api/leads/${leadForeignTripBId}`, authed())).status).toBe(404);

      expect((await fetch(`${baseUrl}/api/reservations/${resForeignTripAId}`, authed())).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/reservations/${resForeignTripBId}`, authed())).status).toBe(404);
      // resForeignLead referencia leadOrgA (empresa A, agora no escopo), mas
      // leadOrgA.tripId é tripOrgA, diferente da própria viagem da reserva
      // (tripLegacy): a organização do lead ficou consistente, mas a viagem
      // do lead continua divergindo da viagem da reserva — permanece negado
      // (consistência transitiva reserva.tripId <-> lead.tripId).
      expect((await fetch(`${baseUrl}/api/reservations/${resForeignLeadId}`, authed())).status).toBe(404);
    } finally {
      config.legacyTourismOrganizationId = null;
    }
  });
});
