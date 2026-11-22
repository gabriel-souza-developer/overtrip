import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

// Trilha de auditoria (ReservationAuditLog) para mutações de reserva da
// própria empresa, inspirada no audit log do painel admin do TREK (ideia de
// produto, nenhum código reaproveitado — TREK é AGPL-3.0). Cobre: conteúdo
// mínimo gravado (nunca nome/telefone de cliente, valor ou observação),
// mesma transação da mutação (sem linha de auditoria para escrita que falha
// ou é recusada), isolamento por empresa e papel na leitura, revogação de
// vínculo e paginação. O painel legado (reservationRoutes.ts, reservas sem
// empresa) nunca escreve nesta tabela — comportamento verificado, não só
// assumido, no último describe().

let server: Server;
let base: string;
let legacyBase: string;
let ownerId: string; let ownerToken: string;
let memberId: string; let memberToken: string;
let strangerId: string; let strangerToken: string;
let orgA: string; let orgB: string;
let tripA: string; let tripB: string; let legacyTripId: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const essentialBody = () => ({ tripId: tripA, customerName: 'Cliente Auditoria', customerPhone: '83999990000', seats: 2, totalCents: 50000 });

async function createReservation(organizationId: string, overrides: Partial<ReturnType<typeof essentialBody>> = {}) {
  const response = await fetch(`${base}/${organizationId}/tourism/reservations`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody(), ...overrides }) });
  expect(response.status).toBe(201);
  return await response.json() as { id: string; updatedAt: string };
}

function auditCountFor(reservationId: string) {
  return prisma.reservationAuditLog.count({ where: { reservationId } });
}

beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: `org-res-audit-owner:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin', legacyAccess: true } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  const member = await prisma.user.create({ data: { email: `org-res-audit-member:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  memberId = member.id; memberToken = generateToken(member);
  const stranger = await prisma.user.create({ data: { email: `org-res-audit-stranger:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  strangerId = stranger.id; strangerToken = generateToken(stranger);

  orgA = (await prisma.organization.create({ data: { name: 'Agência Auditoria A', slug: `org-res-audit-a-${Date.now()}` } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência Auditoria B', slug: `org-res-audit-b-${Date.now()}` } })).id;
  await prisma.membership.create({ data: { organizationId: orgA, userId: ownerId, role: 'OWNER' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId: ownerId, role: 'ADMIN' } });
  await prisma.membership.create({ data: { organizationId: orgA, userId: memberId, role: 'MEMBER' } });

  const trip = { category: 'Teste', description: 'Teste', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'light', includes: '[]', media: '[]' };
  tripA = (await prisma.trip.create({ data: { ...trip, organizationId: orgA, storedIdentity: `org-res-audit-trip-a-${Date.now()}`, title: 'Viagem A' } })).id;
  tripB = (await prisma.trip.create({ data: { ...trip, organizationId: orgB, storedIdentity: `org-res-audit-trip-b-${Date.now()}`, title: 'Viagem B' } })).id;
  // Viagem sem empresa (organizationId null): só assim entra no escopo legado
  // (/api/reservations), que por padrão exclui qualquer viagem já atribuída
  // a uma organização real como tripA/tripB.
  legacyTripId = (await prisma.trip.create({ data: { ...trip, storedIdentity: `org-res-audit-trip-legacy-${Date.now()}`, title: 'Viagem Legada' } })).id;

  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
  legacyBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/reservations`;
});

afterEach(async () => {
  await prisma.reservationAuditLog.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.reservationInstallment.deleteMany({ where: { reservation: { organizationId: { in: [orgA, orgB] } } } });
  await prisma.reservation.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.membership.updateMany({ where: { organizationId: orgA, userId: ownerId }, data: { status: 'ACTIVE' } });
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.reservationAuditLog.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.reservationInstallment.deleteMany({ where: { reservation: { organizationId: { in: [orgA, orgB] } } } });
  await prisma.reservation.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  // Trip referencia Organization com onDelete: Restrict — precisa ser
  // removida antes da empresa, nunca depois.
  await prisma.trip.deleteMany({ where: { id: { in: [tripA, tripB, legacyTripId] } } });
  await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, memberId, strangerId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId, strangerId] } } });
  await prisma.$disconnect();
});

describe('ReservationAuditLog — conteúdo gravado', () => {
  it('criar reserva grava uma entrada mínima, sem nome/telefone/valor do cliente', async () => {
    const created = await createReservation(orgA);
    const rows = await prisma.reservationAuditLog.findMany({ where: { reservationId: created.id } });
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.action).toBe('RESERVATION_CREATED');
    expect(row.entityType).toBe('Reservation');
    expect(row.entityId).toBe(created.id);
    expect(row.organizationId).toBe(orgA);
    expect(row.actorUserId).toBe(ownerId);
    // O modelo nem tem colunas para esses dados: a checagem de chaves prova
    // que nada sensível foi anexado por engano em algum ponto do fluxo.
    expect(Object.keys(row).sort()).toEqual(['action', 'actorUserId', 'createdAt', 'entityId', 'entityType', 'id', 'organizationId', 'reservationId'].sort());
  });

  it('editar reserva e mexer em parcelas grava uma entrada por mutação, todas ligadas à reserva dona', async () => {
    const created = await createReservation(orgA);
    await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ status: 'CONFIRMED', expectedUpdatedAt: created.updatedAt }) });
    const afterUpdate = await (await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { headers: auth(ownerToken) })).json() as { updatedAt: string };

    const installmentRes = await fetch(`${base}/${orgA}/tourism/reservations/${created.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 20000, expectedUpdatedAt: afterUpdate.updatedAt }) });
    expect(installmentRes.status).toBe(201);
    const withInstallment = await installmentRes.json() as { updatedAt: string; installments: { id: string }[] };
    const installmentId = withInstallment.installments[0].id;

    await fetch(`${base}/${orgA}/tourism/reservations/${created.id}/installments/${installmentId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 25000, expectedUpdatedAt: withInstallment.updatedAt }) });
    const afterInstallmentUpdate = await (await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { headers: auth(ownerToken) })).json() as { updatedAt: string };
    await fetch(`${base}/${orgA}/tourism/reservations/${created.id}/installments/${installmentId}`, { method: 'DELETE', headers: auth(ownerToken), body: JSON.stringify({ expectedUpdatedAt: afterInstallmentUpdate.updatedAt }) });

    const rows = await prisma.reservationAuditLog.findMany({ where: { reservationId: created.id }, orderBy: { createdAt: 'asc' } });
    expect(rows.map(row => row.action)).toEqual(['RESERVATION_CREATED', 'RESERVATION_UPDATED', 'INSTALLMENT_CREATED', 'INSTALLMENT_UPDATED', 'INSTALLMENT_DELETED']);
    expect(rows.every(row => row.reservationId === created.id)).toBe(true);
    const installmentRows = rows.filter(row => row.entityType === 'ReservationInstallment');
    expect(installmentRows.every(row => row.entityId === installmentId)).toBe(true);
  });
});

describe('ReservationAuditLog — falhas transacionais nunca deixam rastro', () => {
  it('escrita recusada (viagem de outra empresa) não grava entrada alguma', async () => {
    const before = await prisma.reservationAuditLog.count({ where: { organizationId: orgA } });
    const response = await fetch(`${base}/${orgA}/tourism/reservations`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody(), tripId: tripB }) });
    expect(response.status).toBe(404);
    expect(await prisma.reservationAuditLog.count({ where: { organizationId: orgA } })).toBe(before);
  });

  it('concorrência: conflito de versão (409) não grava entrada; a atualização que vence grava exatamente uma', async () => {
    const created = await createReservation(orgA);
    expect(await auditCountFor(created.id)).toBe(1); // só a criação, até aqui

    // Primeira escrita, ancorada no updatedAt lido na criação: vence e avança a versão.
    const first = await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ status: 'CANCELLED', expectedUpdatedAt: created.updatedAt }) });
    expect(first.status).toBe(200);
    expect(await auditCountFor(created.id)).toBe(2);

    // Segunda escrita simulando o "outro escritor" concorrente: parte do
    // MESMO updatedAt já desatualizado pela escrita anterior — deve perder.
    const conflicting = await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ customerName: 'Outro nome', expectedUpdatedAt: created.updatedAt }) });
    expect(conflicting.status).toBe(409);
    expect(await auditCountFor(created.id)).toBe(2); // conflito não soma mais nenhuma entrada
  });

  it('revogação do vínculo: escrita recusada (403) depois de revogar não grava entrada', async () => {
    const created = await createReservation(orgA);
    expect(await auditCountFor(created.id)).toBe(1);
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'REVOKED' } });
    const response = await fetch(`${base}/${orgA}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ status: 'CONFIRMED', expectedUpdatedAt: created.updatedAt }) });
    expect(response.status).toBe(403);
    expect(await auditCountFor(created.id)).toBe(1);
  });
});

describe('GET /api/organizations/:organizationId/tourism/reservations/:reservationId/audit', () => {
  it('OWNER/ADMIN da própria empresa lê a trilha, paginada', async () => {
    const created = await createReservation(orgA);
    let current = created;
    for (let index = 0; index < 3; index += 1) {
      const response = await fetch(`${base}/${orgA}/tourism/reservations/${current.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 1000, expectedUpdatedAt: current.updatedAt }) });
      expect(response.status).toBe(201);
      current = await response.json() as typeof created;
    }
    // 1 criação + 3 parcelas = 4 entradas.
    const page1 = await (await fetch(`${base}/${orgA}/tourism/reservations/${created.id}/audit?page=1&limit=2`, { headers: auth(ownerToken) })).json() as { data: unknown[]; pagination: { total: number; totalPages: number } };
    expect(page1.data).toHaveLength(2);
    expect(page1.pagination.total).toBe(4);
    expect(page1.pagination.totalPages).toBe(2);
    const page2 = await (await fetch(`${base}/${orgA}/tourism/reservations/${created.id}/audit?page=2&limit=2`, { headers: auth(ownerToken) })).json() as { data: unknown[] };
    expect(page2.data).toHaveLength(2);
  });

  it('MEMBER e usuário sem vínculo não leem a trilha de ninguém', async () => {
    const created = await createReservation(orgA);
    expect((await fetch(`${base}/${orgA}/tourism/reservations/${created.id}/audit`, { headers: auth(memberToken) })).status).toBe(403);
    expect((await fetch(`${base}/${orgA}/tourism/reservations/${created.id}/audit`, { headers: auth(strangerToken) })).status).toBe(403);
  });

  it('nunca revela a trilha de uma reserva de outra empresa: mesmo id sob a organização errada responde 404', async () => {
    const created = await createReservation(orgA);
    const response = await fetch(`${base}/${orgB}/tourism/reservations/${created.id}/audit`, { headers: auth(ownerToken) });
    expect(response.status).toBe(404);
  });
});

describe('painel legado (reservas sem empresa): nunca grava nesta tabela', () => {
  it('criar e editar uma reserva legada (organizationId nulo) não grava nenhuma entrada de auditoria', async () => {
    const createResponse = await fetch(legacyBase, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ tripId: legacyTripId, customerName: 'Cliente Legado', seats: 1, totalCents: 10000 }) });
    expect(createResponse.status).toBe(201);
    const legacy = await createResponse.json() as { id: string };
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: legacy.id } })).organizationId).toBeNull();

    await fetch(`${legacyBase}/${legacy.id}`, { method: 'PATCH', headers: auth(ownerToken), body: JSON.stringify({ status: 'CONFIRMED' }) });
    await fetch(`${legacyBase}/${legacy.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 5000 }) });

    expect(await prisma.reservationAuditLog.count({ where: { reservationId: legacy.id } })).toBe(0);
    await prisma.reservationInstallment.deleteMany({ where: { reservationId: legacy.id } });
    await prisma.reservation.delete({ where: { id: legacy.id } });
  });
});
