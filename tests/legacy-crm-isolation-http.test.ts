import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { config } from '../src/config.js';

const prisma = new PrismaClient();
const TAG = `legacy-crm-isolation-test:${Date.now()}`;

let server: Server;
let baseUrl: string;
let token: string;
let userId: string;
let orgAId: string;
let orgBId: string;
let tripLegacyId: string;
let tripOrgAId: string;
let tripOrgBId: string;
let leadLegacyId: string;
let leadOrgAId: string;
let leadOrgBId: string;
let resLegacyId: string;
let resOrgAId: string;
let resOrgBId: string;

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

const makeLead = (organizationId: string | null, tripId: string, label: string) => prisma.lead.create({
  data: { organizationId, tripId, name: `${TAG}:${label}` },
});

const makeReservation = (organizationId: string | null, tripId: string) => prisma.reservation.create({
  data: { organizationId, tripId, customerName: TAG, seats: 1, totalCents: 1000 },
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

  const [leadLegacy, leadOrgA, leadOrgB] = await Promise.all([
    makeLead(null, tripLegacyId, 'legacy'),
    makeLead(orgAId, tripOrgAId, 'org-a'),
    makeLead(orgBId, tripOrgBId, 'org-b'),
  ]);
  leadLegacyId = leadLegacy.id;
  leadOrgAId = leadOrgA.id;
  leadOrgBId = leadOrgB.id;

  const [resLegacy, resOrgA, resOrgB] = await Promise.all([
    makeReservation(null, tripLegacyId),
    makeReservation(orgAId, tripOrgAId),
    makeReservation(orgBId, tripOrgBId),
  ]);
  resLegacyId = resLegacy.id;
  resOrgAId = resOrgA.id;
  resOrgBId = resOrgB.id;
});

afterAll(async () => {
  config.legacyTourismOrganizationId = null;
  await prisma.reservationInstallment.deleteMany({ where: { reservation: { customerName: TAG } } });
  await prisma.reservation.deleteMany({ where: { customerName: TAG } });
  await prisma.leadEvent.deleteMany({ where: { lead: { name: { startsWith: `${TAG}:` } } } });
  await prisma.lead.deleteMany({ where: { name: { startsWith: `${TAG}:` } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: `${TAG}:` } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('isolamento legado de leads (CRM) vs. organizações', () => {
  it('lista e filtra por tripId só o escopo legado, nunca de outra empresa', async () => {
    const own = await (await fetch(`${baseUrl}/api/leads?tripId=${tripLegacyId}`, authed())).json() as { data: Array<{ id: string }> };
    expect(own.data.map((l) => l.id)).toContain(leadLegacyId);

    const foreign = await (await fetch(`${baseUrl}/api/leads?tripId=${tripOrgAId}`, authed())).json() as { data: Array<{ id: string }> };
    expect(foreign.data).toEqual([]);
  });

  it('detalhe: 200 para interessado legado, 404 para interessado de outra empresa', async () => {
    expect((await fetch(`${baseUrl}/api/leads/${leadLegacyId}`, authed())).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/leads/${leadOrgAId}`, authed())).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/leads/${leadOrgBId}`, authed())).status).toBe(404);
  });

  it('PUT em interessado de outra empresa retorna 404 e não altera o registro', async () => {
    const res = await fetch(`${baseUrl}/api/leads/${leadOrgAId}`, json('PUT', { stage: 'WON' }));
    expect(res.status).toBe(404);
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: leadOrgAId } });
    expect(after.stage).toBe('NEW');
  });

  it('PUT não permite vincular um interessado legado a uma viagem de outra empresa', async () => {
    const res = await fetch(`${baseUrl}/api/leads/${leadLegacyId}`, json('PUT', { tripId: tripOrgAId }));
    expect(res.status).toBe(400);
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: leadLegacyId } });
    expect(after.tripId).toBe(tripLegacyId);
  });

  it('eventos: 404 ao registrar evento em interessado de outra empresa', async () => {
    const res = await fetch(`${baseUrl}/api/leads/${leadOrgAId}/events`, json('POST', { body: 'tentativa' }));
    expect(res.status).toBe(404);
  });

  it('DELETE em interessado de outra empresa retorna 404 e não o exclui', async () => {
    const res = await fetch(`${baseUrl}/api/leads/${leadOrgBId}`, authed({ method: 'DELETE' }));
    expect(res.status).toBe(404);
    expect(await prisma.lead.findUnique({ where: { id: leadOrgBId } })).not.toBeNull();
  });

  it('POST (criação) recusa organizationId explícito no corpo e vincula só viagens do escopo legado', async () => {
    const strict = await fetch(`${baseUrl}/api/leads`, json('POST', { name: 'X', organizationId: orgAId }));
    expect(strict.status).toBe(400);

    const foreignTrip = await fetch(`${baseUrl}/api/leads`, json('POST', { name: `${TAG}:novo`, tripId: tripOrgAId }));
    expect(foreignTrip.status).toBe(400);

    const ok = await fetch(`${baseUrl}/api/leads`, json('POST', { name: `${TAG}:novo`, tripId: tripLegacyId }));
    expect(ok.status).toBe(201);
    const created = await ok.json();
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.organizationId).toBeNull();
    await prisma.lead.delete({ where: { id: created.id } });
  });
});

describe('isolamento legado de reservas vs. organizações', () => {
  it('lista e filtra por tripId só o escopo legado, nunca de outra empresa', async () => {
    const own = await (await fetch(`${baseUrl}/api/reservations?tripId=${tripLegacyId}`, authed())).json() as { data: Array<{ id: string }> };
    expect(own.data.map((r) => r.id)).toContain(resLegacyId);

    const foreign = await (await fetch(`${baseUrl}/api/reservations?tripId=${tripOrgAId}`, authed())).json() as { data: Array<{ id: string }> };
    expect(foreign.data).toEqual([]);
  });

  it('detalhe: 200 para reserva legada, 404 para reserva de outra empresa', async () => {
    expect((await fetch(`${baseUrl}/api/reservations/${resLegacyId}`, authed())).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/reservations/${resOrgAId}`, authed())).status).toBe(404);
  });

  it('POST não cria reserva vinculada a uma viagem de outra empresa', async () => {
    const res = await fetch(`${baseUrl}/api/reservations`, json('POST', { tripId: tripOrgAId, customerName: 'Pessoa', seats: 1, totalCents: 1000 }));
    expect(res.status).toBe(404);
  });

  it('POST não vincula reserva legada a um interessado (lead) de outra empresa', async () => {
    const res = await fetch(`${baseUrl}/api/reservations`, json('POST', { tripId: tripLegacyId, leadId: leadOrgAId, customerName: 'Pessoa', seats: 1, totalCents: 1000 }));
    expect(res.status).toBe(404);
  });

  it('POST (criação) nasce no escopo legado padrão', async () => {
    const res = await fetch(`${baseUrl}/api/reservations`, json('POST', { tripId: tripLegacyId, customerName: TAG, seats: 1, totalCents: 1000 }));
    expect(res.status).toBe(201);
    const created = await res.json();
    const row = await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.organizationId).toBeNull();
    await prisma.reservation.delete({ where: { id: created.id } });
  });

  it('PATCH em reserva de outra empresa retorna 404 e não a altera', async () => {
    const res = await fetch(`${baseUrl}/api/reservations/${resOrgBId}`, json('PATCH', { customerName: 'Sequestrada' }));
    expect(res.status).toBe(404);
    const after = await prisma.reservation.findUniqueOrThrow({ where: { id: resOrgBId } });
    expect(after.customerName).toBe(TAG);
  });

  it('parcelas: 404 ao criar/alterar/excluir parcela de reserva de outra empresa', async () => {
    const createUrl = `${baseUrl}/api/reservations/${resOrgAId}/installments`;
    expect((await fetch(createUrl, json('POST', { amountCents: 100 }))).status).toBe(404);

    const installment = await prisma.reservationInstallment.create({ data: { reservationId: resOrgAId, amountCents: 500 } });
    expect((await fetch(`${createUrl}/${installment.id}`, json('PATCH', { paid: true }))).status).toBe(404);
    expect((await fetch(`${createUrl}/${installment.id}`, authed({ method: 'DELETE' }))).status).toBe(404);
    await prisma.reservationInstallment.delete({ where: { id: installment.id } });
  });
});

describe('isolamento legado de CRM com LEGACY_TOURISM_ORGANIZATION_ID configurado', () => {
  it('passa a incluir leads e reservas da organização configurada, nunca das demais', async () => {
    config.legacyTourismOrganizationId = orgAId;
    try {
      const leads = await (await fetch(`${baseUrl}/api/leads?tripId=${tripOrgAId}`, authed())).json() as { data: Array<{ id: string }> };
      expect(leads.data.map((l) => l.id)).toContain(leadOrgAId);
      expect((await fetch(`${baseUrl}/api/leads/${leadOrgBId}`, authed())).status).toBe(404);

      const reservations = await (await fetch(`${baseUrl}/api/reservations?tripId=${tripOrgAId}`, authed())).json() as { data: Array<{ id: string }> };
      expect(reservations.data.map((r) => r.id)).toContain(resOrgAId);
      expect((await fetch(`${baseUrl}/api/reservations/${resOrgBId}`, authed())).status).toBe(404);
    } finally {
      config.legacyTourismOrganizationId = null;
    }
  });
});
