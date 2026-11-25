import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

// Primeira operação de escrita de reservas administrativas no escopo de
// organização. Cobre: isolamento entre duas empresas, papéis e revogação,
// spoofing (organizationId, status no corpo da criação, tripId na edição),
// vínculo cruzado com interessado de outra empresa/viagem, concorrência
// (updatedAt estritamente crescente com 409 em versão antiga) e o limite de
// nunca baixar o total abaixo das parcelas já registradas.

let server: Server;
let base: string;
let ownerId: string; let ownerToken: string;
let memberId: string; let memberToken: string;
let strangerId: string; let strangerToken: string;
let orgA: string; let orgB: string; let orgC: string;
let tripA: string; let tripA2: string; let tripB: string;
let leadOwnTrip: string; let leadOtherTrip: string; let leadOrgB: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const essentialBody = () => ({ tripId: tripA, customerName: 'Cliente Reserva', customerPhone: '83999990000', seats: 2, totalCents: 50000 });

beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: `org-res-write-owner:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  const member = await prisma.user.create({ data: { email: `org-res-write-member:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  memberId = member.id; memberToken = generateToken(member);
  const stranger = await prisma.user.create({ data: { email: `org-res-write-stranger:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  strangerId = stranger.id; strangerToken = generateToken(stranger);

  orgA = (await prisma.organization.create({ data: { name: 'Agência Reserva A', slug: `org-res-write-a-${Date.now()}` } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência Reserva B', slug: `org-res-write-b-${Date.now()}` } })).id;
  orgC = (await prisma.organization.create({ data: { name: 'Agência Reserva C (inativa)', slug: `org-res-write-c-${Date.now()}` } })).id;
  await prisma.organization.update({ where: { id: orgC }, data: { status: 'INACTIVE' } });

  await prisma.membership.create({ data: { organizationId: orgA, userId: ownerId, role: 'OWNER' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId: ownerId, role: 'ADMIN' } });
  await prisma.membership.create({ data: { organizationId: orgA, userId: memberId, role: 'MEMBER' } });
  await prisma.membership.create({ data: { organizationId: orgC, userId: ownerId, role: 'OWNER' } });

  const trip = { category: 'Teste', description: 'Teste', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'light', includes: '[]', media: '[]' };
  tripA = (await prisma.trip.create({ data: { ...trip, organizationId: orgA, storedIdentity: `org-res-write-trip-a-${Date.now()}`, title: 'Viagem A' } })).id;
  tripA2 = (await prisma.trip.create({ data: { ...trip, organizationId: orgA, storedIdentity: `org-res-write-trip-a2-${Date.now()}`, title: 'Viagem A2' } })).id;
  tripB = (await prisma.trip.create({ data: { ...trip, organizationId: orgB, storedIdentity: `org-res-write-trip-b-${Date.now()}`, title: 'Viagem B' } })).id;
  leadOwnTrip = (await prisma.lead.create({ data: { organizationId: orgA, name: 'Interessado A', tripId: tripA } })).id;
  leadOtherTrip = (await prisma.lead.create({ data: { organizationId: orgA, name: 'Interessado A2', tripId: tripA2 } })).id;
  leadOrgB = (await prisma.lead.create({ data: { organizationId: orgB, name: 'Interessado B', tripId: tripB } })).id;

  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterEach(async () => {
  await prisma.reservationInstallment.deleteMany({ where: { reservation: { organizationId: { in: [orgA, orgB, orgC] } } } });
  await prisma.reservation.deleteMany({ where: { organizationId: { in: [orgA, orgB, orgC] } } });
  await prisma.membership.updateMany({ where: { organizationId: orgA, userId: ownerId }, data: { status: 'ACTIVE' } });
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.reservationInstallment.deleteMany({ where: { reservation: { organizationId: { in: [orgA, orgB, orgC] } } } });
  await prisma.reservation.deleteMany({ where: { organizationId: { in: [orgA, orgB, orgC] } } });
  await prisma.lead.deleteMany({ where: { id: { in: [leadOwnTrip, leadOtherTrip, leadOrgB] } } });
  await prisma.trip.deleteMany({ where: { id: { in: [tripA, tripA2, tripB] } } });
  await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, memberId, strangerId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB, orgC] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId, strangerId] } } });
  await prisma.$disconnect();
});

describe('POST /api/organizations/:organizationId/tourism/reservations', () => {
  it('OWNER/ADMIN cria uma reserva administrativa (status inicial sempre PENDING, sem garantir vaga)', async () => {
    const response = await fetch(`${base}/${orgA}/tourism/reservations`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(essentialBody()) });
    expect(response.status).toBe(201);
    const created = await response.json() as { id: string; status: string; tripId: string };
    expect(created.status).toBe('PENDING');
    expect(created.tripId).toBe(tripA);
    const row = await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.organizationId).toBe(orgA);
  });

  it('aceita o vínculo com interessado só se puder validá-lo por completo; nunca cria vínculo cruzado em silêncio', async () => {
    const ok = await fetch(`${base}/${orgA}/tourism/reservations`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody(), leadId: leadOwnTrip }) });
    expect(ok.status).toBe(201);
    expect((await ok.json() as { leadId: string | null }).leadId).toBe(leadOwnTrip);

    const wrongTrip = await fetch(`${base}/${orgA}/tourism/reservations`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody(), leadId: leadOtherTrip }) });
    expect(wrongTrip.status).toBe(409);

    const crossOrg = await fetch(`${base}/${orgA}/tourism/reservations`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody(), leadId: leadOrgB }) });
    expect(crossOrg.status).toBe(404);
    expect(await prisma.reservation.count({ where: { organizationId: orgA, leadId: leadOrgB } })).toBe(0);
  });

  it('nunca aceita organizationId, status ou campos fora do essencial (spoofing é recusado, nunca ignorado em silêncio)', async () => {
    const spoofed = { ...essentialBody(), organizationId: orgB, status: 'CONFIRMED', notes: 'tentativa' };
    const response = await fetch(`${base}/${orgA}/tourism/reservations`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(spoofed) });
    expect(response.status).toBe(400);
    expect((await response.json() as { code: string }).code).toBe('VALIDATION_ERROR');
  });

  it('nunca cria reserva para viagem de outra empresa (tripId cruzado)', async () => {
    const response = await fetch(`${base}/${orgA}/tourism/reservations`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody(), tripId: tripB }) });
    expect(response.status).toBe(404);
    expect(await prisma.reservation.count({ where: { organizationId: orgA, tripId: tripB } })).toBe(0);
  });

  it('MEMBER e usuário sem vínculo não têm acesso algum; empresa inativa recusa mesmo para o OWNER', async () => {
    expect((await fetch(`${base}/${orgA}/tourism/reservations`, { headers: { Authorization: `Bearer ${memberToken}` } })).status).toBe(403);
    expect((await fetch(`${base}/${orgA}/tourism/reservations`, { method: 'POST', headers: auth(memberToken), body: JSON.stringify(essentialBody()) })).status).toBe(403);
    expect((await fetch(`${base}/${orgB}/tourism/reservations`, { method: 'POST', headers: auth(strangerToken), body: JSON.stringify(essentialBody()) })).status).toBe(403);
    expect((await fetch(`${base}/${orgC}/tourism/reservations`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(essentialBody()) })).status).toBe(403);
    expect(await prisma.reservation.count({ where: { organizationId: { in: [orgA, orgB] } } })).toBe(0);
  });

  it('valida dados essenciais (nome vazio, lugares/valor fora da faixa)', async () => {
    expect((await fetch(`${base}/${orgA}/tourism/reservations`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody(), customerName: '' }) })).status).toBe(400);
    expect((await fetch(`${base}/${orgA}/tourism/reservations`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody(), seats: 0 }) })).status).toBe(400);
    expect((await fetch(`${base}/${orgA}/tourism/reservations`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody(), totalCents: -1 }) })).status).toBe(400);
  });
});

describe('PUT /api/organizations/:organizationId/tourism/reservations/:reservationId', () => {
  async function createReservation(organizationId: string, overrides: Partial<ReturnType<typeof essentialBody>> = {}) {
    const response = await fetch(`${base}/${organizationId}/tourism/reservations`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody(), ...overrides }) });
    expect(response.status).toBe(201);
    return await response.json() as { id: string; updatedAt: string };
  }

  it('atualiza parcialmente (campos ausentes preservam o valor atual) e permite marcar status manualmente', async () => {
    const created = await createReservation(orgA);
    const response = await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ status: 'CONFIRMED', expectedUpdatedAt: created.updatedAt }) });
    expect(response.status).toBe(200);
    const updated = await response.json() as { status: string; customerName: string; seats: number };
    expect(updated.status).toBe('CONFIRMED');
    expect(updated.customerName).toBe('Cliente Reserva');
    expect(updated.seats).toBe(2);
  });

  it('nunca modifica reserva de outra empresa: id correto na URL de organização errada responde 404', async () => {
    const created = await createReservation(orgA);
    const response = await fetch(`${base}/${orgB}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ status: 'CANCELLED', expectedUpdatedAt: created.updatedAt }) });
    expect(response.status).toBe(404);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } })).status).toBe('PENDING');
  });

  it('MEMBER e usuário sem vínculo não podem editar', async () => {
    const created = await createReservation(orgA);
    expect((await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(memberToken), body: JSON.stringify({ status: 'CANCELLED', expectedUpdatedAt: created.updatedAt }) })).status).toBe(403);
    expect((await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(strangerToken), body: JSON.stringify({ status: 'CANCELLED', expectedUpdatedAt: created.updatedAt }) })).status).toBe(403);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } })).status).toBe('PENDING');
  });

  it('nunca aceita organizationId ou tripId arbitrários no corpo da atualização (viagem é imutável após criada)', async () => {
    const created = await createReservation(orgA);
    const response = await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ organizationId: orgB, tripId: tripA2, expectedUpdatedAt: created.updatedAt }) });
    expect(response.status).toBe(400);
    const row = await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.organizationId).toBe(orgA);
    expect(row.tripId).toBe(tripA);
  });

  it('vincular a um interessado de outra viagem ou de outra empresa é recusado sem revelar dados, mesmo na edição', async () => {
    const created = await createReservation(orgA);
    const wrongTrip = await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ leadId: leadOtherTrip, expectedUpdatedAt: created.updatedAt }) });
    expect(wrongTrip.status).toBe(409);
    const crossOrg = await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ leadId: leadOrgB, expectedUpdatedAt: created.updatedAt }) });
    expect(crossOrg.status).toBe(404);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } })).leadId).toBeNull();
  });

  it('concorrência: rejeita updatedAt antigo com 409 e preserva a atualização mais recente (nunca perde a escrita concorrente)', async () => {
    const created = await createReservation(orgA);
    const first = await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ customerName: 'Nome atualizado', expectedUpdatedAt: created.updatedAt }) });
    expect(first.status).toBe(200);
    const updated = await first.json() as { updatedAt: string; customerName: string };
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(created.updatedAt).getTime());
    expect(updated.customerName).toBe('Nome atualizado');

    const stale = await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ status: 'CANCELLED', expectedUpdatedAt: created.updatedAt }) });
    expect(stale.status).toBe(409);
    const row = await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.customerName).toBe('Nome atualizado');
    expect(row.status).toBe('PENDING');
  });

  it('nunca permite baixar o total abaixo da soma das parcelas já registradas', async () => {
    const created = await createReservation(orgA, { totalCents: 50000 });
    await prisma.reservationInstallment.create({ data: { reservationId: created.id, amountCents: 30000 } });
    const tooLow = await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ totalCents: 20000, expectedUpdatedAt: created.updatedAt }) });
    expect(tooLow.status).toBe(409);
    const ok = await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ totalCents: 40000, expectedUpdatedAt: created.updatedAt }) });
    expect(ok.status).toBe(200);
    expect((await ok.json() as { totalCents: number }).totalCents).toBe(40000);
  });

  it('reserva inexistente responde 404', async () => {
    const response = await fetch(`${base}/${orgA}/tourism/reservations/nao-existe`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ status: 'CANCELLED', expectedUpdatedAt: new Date().toISOString() }) });
    expect(response.status).toBe(404);
  });
});
