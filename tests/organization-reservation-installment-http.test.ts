import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';
import { config } from '../src/config.js';

// Registro administrativo de parcelas no escopo de organização. Cobre:
// isolamento entre duas empresas, papéis e revogação, inconsistências
// (parcela/reserva de outra empresa sem revelar dados), regras monetárias
// (centavos positivos, soma nunca maior que o total, limite de 120),
// bloqueio de edição/exclusão com recebimento marcado, reserva cancelada e
// concorrência ancorada no updatedAt da reserva (que avança em toda
// mutação de parcela).

let server: Server;
let base: string;
let ownerId: string; let ownerToken: string;
let memberId: string; let memberToken: string;
let strangerId: string; let strangerToken: string;
let orgA: string; let orgB: string;
let tripA: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: `org-res-installment-owner:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  const member = await prisma.user.create({ data: { email: `org-res-installment-member:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  memberId = member.id; memberToken = generateToken(member);
  const stranger = await prisma.user.create({ data: { email: `org-res-installment-stranger:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  strangerId = stranger.id; strangerToken = generateToken(stranger);

  orgA = (await prisma.organization.create({ data: { name: 'Agência Parcela A', slug: `org-res-installment-a-${Date.now()}` } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência Parcela B', slug: `org-res-installment-b-${Date.now()}` } })).id;

  await prisma.membership.create({ data: { organizationId: orgA, userId: ownerId, role: 'OWNER' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId: ownerId, role: 'ADMIN' } });
  await prisma.membership.create({ data: { organizationId: orgA, userId: memberId, role: 'MEMBER' } });

  const trip = { category: 'Teste', description: 'Teste', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'light', includes: '[]', media: '[]' };
  tripA = (await prisma.trip.create({ data: { ...trip, organizationId: orgA, storedIdentity: `org-res-installment-trip-a-${Date.now()}`, title: 'Viagem A' } })).id;

  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterEach(async () => {
  await prisma.reservationInstallment.deleteMany({ where: { reservation: { organizationId: { in: [orgA, orgB] } } } });
  await prisma.reservation.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.membership.updateMany({ where: { organizationId: orgA, userId: ownerId }, data: { status: 'ACTIVE' } });
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.reservationInstallment.deleteMany({ where: { reservation: { organizationId: { in: [orgA, orgB] } } } });
  await prisma.reservation.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.trip.deleteMany({ where: { id: tripA } });
  await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, memberId, strangerId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId, strangerId] } } });
  await prisma.$disconnect();
});

async function createReservation(organizationId: string, totalCents = 100000) {
  const response = await fetch(`${base}/${organizationId}/tourism/reservations`, {
    method: 'POST', headers: auth(ownerToken),
    body: JSON.stringify({ tripId: tripA, customerName: 'Cliente Parcelado', customerPhone: '83999990000', seats: 2, totalCents }),
  });
  expect(response.status).toBe(201);
  return await response.json() as { id: string; updatedAt: string; totalCents: number };
}

describe('POST /api/organizations/:organizationId/tourism/reservations/:reservationId/installments', () => {
  it('altera a versão em cada mutação legada e rejeita operações de empresa com versão antiga', async () => {
    const legacy = await prisma.user.create({ data: { email: `legacy-installments:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin', legacyAccess: true } });
    const oldScope = config.legacyTourismOrganizationId;
    config.legacyTourismOrganizationId = orgA;
    try {
      const reservation = await createReservation(orgA);
      const legacyUrl = `${base.replace(/\/organizations$/, '')}/reservations/${reservation.id}/installments`;
      const orgUrl = `${base}/${orgA}/tourism/reservations/${reservation.id}/installments`;
      const created = await fetch(legacyUrl, { method: 'POST', headers: auth(generateToken(legacy)), body: JSON.stringify({ amountCents: 1000 }) });
      expect(created.status).toBe(201);
      const installment = await created.json() as { id: string };
      const staleCreate = await fetch(orgUrl, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 1000, expectedUpdatedAt: reservation.updatedAt }) });
      expect(staleCreate.status).toBe(409);
      const afterCreate = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
      expect(afterCreate.updatedAt.getTime()).toBeGreaterThan(new Date(reservation.updatedAt).getTime());

      const edited = await fetch(`${legacyUrl}/${installment.id}`, { method: 'PATCH', headers: auth(generateToken(legacy)), body: JSON.stringify({ paid: true }) });
      expect(edited.status).toBe(200);
      const staleEdit = await fetch(`${orgUrl}/${installment.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ paid: false, expectedUpdatedAt: afterCreate.updatedAt.toISOString() }) });
      expect(staleEdit.status).toBe(409);
      const afterEdit = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
      expect(afterEdit.updatedAt.getTime()).toBeGreaterThan(afterCreate.updatedAt.getTime());

      const unmark = await fetch(`${legacyUrl}/${installment.id}`, { method: 'PATCH', headers: auth(generateToken(legacy)), body: JSON.stringify({ paid: false }) });
      expect(unmark.status).toBe(200);
      const beforeDelete = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
      const deleted = await fetch(`${legacyUrl}/${installment.id}`, { method: 'DELETE', headers: auth(generateToken(legacy)) });
      expect(deleted.status).toBe(204);
      const afterDelete = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
      expect(afterDelete.updatedAt.getTime()).toBeGreaterThan(beforeDelete.updatedAt.getTime());
      expect((await fetch(orgUrl, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 1000, expectedUpdatedAt: beforeDelete.updatedAt.toISOString() }) })).status).toBe(409);
    } finally {
      config.legacyTourismOrganizationId = oldScope;
      await prisma.user.delete({ where: { id: legacy.id } });
    }
  });
  it('OWNER/ADMIN cadastra uma parcela e a reserva reflete o novo updatedAt (centavos inteiros positivos)', async () => {
    const reservation = await createReservation(orgA);
    const response = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 40000, dueDate: '2030-02-01', expectedUpdatedAt: reservation.updatedAt }) });
    expect(response.status).toBe(201);
    const body = await response.json() as { installments: { amountCents: number }[]; updatedAt: string };
    expect(body.installments).toHaveLength(1);
    expect(body.installments[0].amountCents).toBe(40000);
    expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(new Date(reservation.updatedAt).getTime());
  });

  it('recusa valor zero/negativo e não aceita campos fora do essencial', async () => {
    const reservation = await createReservation(orgA);
    expect((await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 0, expectedUpdatedAt: reservation.updatedAt }) })).status).toBe(400);
    expect((await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: -100, expectedUpdatedAt: reservation.updatedAt }) })).status).toBe(400);
    const spoofed = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 1000, paidAt: new Date().toISOString(), expectedUpdatedAt: reservation.updatedAt }) });
    expect(spoofed.status).toBe(400);
    expect(await prisma.reservationInstallment.count({ where: { reservationId: reservation.id } })).toBe(0);
  });

  it('nunca permite soma de parcelas maior que o total, e respeita o limite de 120 parcelas', async () => {
    const reservation = await createReservation(orgA, 1000);
    const tooMuch = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 1001, expectedUpdatedAt: reservation.updatedAt }) });
    expect(tooMuch.status).toBe(409);

    const full = await createReservation(orgA, 120 * 100);
    let version = full.updatedAt;
    for (let i = 0; i < 120; i++) {
      const response = await fetch(`${base}/${orgA}/tourism/reservations/${full.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 100, expectedUpdatedAt: version }) });
      expect(response.status).toBe(201);
      version = (await response.json() as { updatedAt: string }).updatedAt;
    }
    const over = await fetch(`${base}/${orgA}/tourism/reservations/${full.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 1, expectedUpdatedAt: version }) });
    expect(over.status).toBe(409);
    expect(await prisma.reservationInstallment.count({ where: { reservationId: full.id } })).toBe(120);
  });

  it('nunca cria parcela em reserva cancelada', async () => {
    const reservation = await createReservation(orgA);
    const cancel = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ status: 'CANCELLED', expectedUpdatedAt: reservation.updatedAt }) });
    expect(cancel.status).toBe(200);
    const cancelled = await cancel.json() as { updatedAt: string };
    const response = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 1000, expectedUpdatedAt: cancelled.updatedAt }) });
    expect(response.status).toBe(409);
  });

  it('nunca cria parcela em reserva de outra empresa; MEMBER e usuário sem vínculo não têm acesso', async () => {
    const reservation = await createReservation(orgA);
    const crossOrg = await fetch(`${base}/${orgB}/tourism/reservations/${reservation.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 1000, expectedUpdatedAt: reservation.updatedAt }) });
    expect(crossOrg.status).toBe(404);
    expect((await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments`, { method: 'POST', headers: auth(memberToken), body: JSON.stringify({ amountCents: 1000, expectedUpdatedAt: reservation.updatedAt }) })).status).toBe(403);
    expect((await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments`, { method: 'POST', headers: auth(strangerToken), body: JSON.stringify({ amountCents: 1000, expectedUpdatedAt: reservation.updatedAt }) })).status).toBe(403);
    expect(await prisma.reservationInstallment.count({ where: { reservationId: reservation.id } })).toBe(0);
  });

  it('versão antiga da reserva é recusada com 409 (concorrência ancorada no updatedAt da reserva)', async () => {
    const reservation = await createReservation(orgA);
    const first = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 1000, expectedUpdatedAt: reservation.updatedAt }) });
    expect(first.status).toBe(201);
    const stale = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 1000, expectedUpdatedAt: reservation.updatedAt }) });
    expect(stale.status).toBe(409);
    expect(await prisma.reservationInstallment.count({ where: { reservationId: reservation.id } })).toBe(1);
  });
});

describe('PUT /api/organizations/:organizationId/tourism/reservations/:reservationId/installments/:installmentId', () => {
  async function createInstallment(organizationId: string, reservation: { id: string; updatedAt: string }, amountCents = 10000) {
    const response = await fetch(`${base}/${organizationId}/tourism/reservations/${reservation.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents, expectedUpdatedAt: reservation.updatedAt }) });
    expect(response.status).toBe(201);
    const body = await response.json() as { installments: { id: string; amountCents: number }[]; updatedAt: string };
    return { installmentId: body.installments[body.installments.length - 1].id, updatedAt: body.updatedAt };
  }

  it('edita valor/vencimento e marca recebimento manual; desmarcar libera a edição de novo', async () => {
    const reservation = await createReservation(orgA);
    let { installmentId, updatedAt } = await createInstallment(orgA, reservation, 20000);

    const edited = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 25000, expectedUpdatedAt: updatedAt }) });
    expect(edited.status).toBe(200);
    let body = await edited.json() as { installments: { id: string; amountCents: number; paidAt: string | null }[]; updatedAt: string };
    expect(body.installments.find((i) => i.id === installmentId)?.amountCents).toBe(25000);
    updatedAt = body.updatedAt;

    const marked = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ paid: true, expectedUpdatedAt: updatedAt }) });
    expect(marked.status).toBe(200);
    body = await marked.json() as typeof body;
    expect(body.installments.find((i) => i.id === installmentId)?.paidAt).not.toBeNull();
    updatedAt = body.updatedAt;

    const blocked = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 30000, expectedUpdatedAt: updatedAt }) });
    expect(blocked.status).toBe(409);

    const unmarked = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ paid: false, expectedUpdatedAt: updatedAt }) });
    expect(unmarked.status).toBe(200);
    body = await unmarked.json() as typeof body;
    expect(body.installments.find((i) => i.id === installmentId)?.paidAt).toBeNull();
    updatedAt = body.updatedAt;

    const nowAllowed = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 30000, expectedUpdatedAt: updatedAt }) });
    expect(nowAllowed.status).toBe(200);
  });

  it('nunca permite editar para uma soma maior que o total da reserva', async () => {
    const reservation = await createReservation(orgA, 50000);
    const { installmentId, updatedAt } = await createInstallment(orgA, reservation, 30000);
    const response = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 50001, expectedUpdatedAt: updatedAt }) });
    expect(response.status).toBe(409);
  });

  it('parcela de outra empresa/reserva responde 404 sem revelar dados; MEMBER não pode editar', async () => {
    const reservation = await createReservation(orgA);
    const { installmentId, updatedAt } = await createInstallment(orgA, reservation);
    const crossOrg = await fetch(`${base}/${orgB}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ paid: true, expectedUpdatedAt: updatedAt }) });
    expect(crossOrg.status).toBe(404);
    const otherReservation = await createReservation(orgA);
    const crossReservation = await fetch(`${base}/${orgA}/tourism/reservations/${otherReservation.id}/installments/${installmentId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ paid: true, expectedUpdatedAt: otherReservation.updatedAt }) });
    expect(crossReservation.status).toBe(404);
    expect((await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'PUT', headers: auth(memberToken), body: JSON.stringify({ paid: true, expectedUpdatedAt: updatedAt }) })).status).toBe(403);
    expect((await prisma.reservationInstallment.findUniqueOrThrow({ where: { id: installmentId } })).paidAt).toBeNull();
  });

  it('nunca altera parcela de reserva cancelada', async () => {
    const reservation = await createReservation(orgA);
    const { installmentId, updatedAt } = await createInstallment(orgA, reservation);
    const cancel = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ status: 'CANCELLED', expectedUpdatedAt: updatedAt }) });
    expect(cancel.status).toBe(200);
    const cancelled = await cancel.json() as { updatedAt: string };
    const response = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ paid: true, expectedUpdatedAt: cancelled.updatedAt }) });
    expect(response.status).toBe(409);
  });

  it('versão antiga é recusada com 409, mesmo quando outra parcela (não a editada) mudou', async () => {
    const reservation = await createReservation(orgA, 100000);
    const first = await createInstallment(orgA, reservation, 10000);
    // A segunda parcela usa o updatedAt já avançado pela primeira: a criação
    // de QUALQUER parcela muda o updatedAt da reserva inteira.
    await createInstallment(orgA, { id: reservation.id, updatedAt: first.updatedAt }, 10000);
    const staleUpdate = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${first.installmentId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 15000, expectedUpdatedAt: first.updatedAt }) });
    expect(staleUpdate.status).toBe(409);
    expect((await prisma.reservationInstallment.findUniqueOrThrow({ where: { id: first.installmentId } })).amountCents).toBe(10000);
  });
});

describe('DELETE /api/organizations/:organizationId/tourism/reservations/:reservationId/installments/:installmentId', () => {
  async function createInstallment(organizationId: string, reservation: { id: string; updatedAt: string }, amountCents = 10000) {
    const response = await fetch(`${base}/${organizationId}/tourism/reservations/${reservation.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents, expectedUpdatedAt: reservation.updatedAt }) });
    expect(response.status).toBe(201);
    const body = await response.json() as { installments: { id: string }[]; updatedAt: string };
    return { installmentId: body.installments[body.installments.length - 1].id, updatedAt: body.updatedAt };
  }

  it('exclui a parcela e libera o valor para a soma; recusa excluir com recebimento marcado até desmarcar', async () => {
    const reservation = await createReservation(orgA);
    const { installmentId, updatedAt } = await createInstallment(orgA, reservation, 10000);

    const marked = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ paid: true, expectedUpdatedAt: updatedAt }) });
    expect(marked.status).toBe(200);
    const afterMark = await marked.json() as { updatedAt: string };
    const blockedDelete = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'DELETE', headers: auth(ownerToken), body: JSON.stringify({ expectedUpdatedAt: afterMark.updatedAt }) });
    expect(blockedDelete.status).toBe(409);

    const unmarked = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ paid: false, expectedUpdatedAt: afterMark.updatedAt }) });
    expect(unmarked.status).toBe(200);
    const afterUnmark = await unmarked.json() as { updatedAt: string };
    const deleted = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'DELETE', headers: auth(ownerToken), body: JSON.stringify({ expectedUpdatedAt: afterUnmark.updatedAt }) });
    expect(deleted.status).toBe(200);
    expect(await prisma.reservationInstallment.count({ where: { id: installmentId } })).toBe(0);
  });

  it('nunca exclui parcela de outra empresa, nem com MEMBER/sem vínculo', async () => {
    const reservation = await createReservation(orgA);
    const { installmentId, updatedAt } = await createInstallment(orgA, reservation);
    expect((await fetch(`${base}/${orgB}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'DELETE', headers: auth(ownerToken), body: JSON.stringify({ expectedUpdatedAt: updatedAt }) })).status).toBe(404);
    expect((await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'DELETE', headers: auth(memberToken), body: JSON.stringify({ expectedUpdatedAt: updatedAt }) })).status).toBe(403);
    expect((await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'DELETE', headers: auth(strangerToken), body: JSON.stringify({ expectedUpdatedAt: updatedAt }) })).status).toBe(403);
    expect(await prisma.reservationInstallment.count({ where: { id: installmentId } })).toBe(1);
  });

  it('nunca exclui parcela de reserva cancelada; parcela inexistente responde 404', async () => {
    const reservation = await createReservation(orgA);
    const { installmentId, updatedAt } = await createInstallment(orgA, reservation);
    const cancel = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ status: 'CANCELLED', expectedUpdatedAt: updatedAt }) });
    const cancelled = await cancel.json() as { updatedAt: string };
    const response = await fetch(`${base}/${orgA}/tourism/reservations/${reservation.id}/installments/${installmentId}`, { method: 'DELETE', headers: auth(ownerToken), body: JSON.stringify({ expectedUpdatedAt: cancelled.updatedAt }) });
    expect(response.status).toBe(409);
    const another = await createReservation(orgA);
    const notFound = await fetch(`${base}/${orgA}/tourism/reservations/${another.id}/installments/nao-existe`, { method: 'DELETE', headers: auth(ownerToken), body: JSON.stringify({ expectedUpdatedAt: another.updatedAt }) });
    expect(notFound.status).toBe(404);
  });
});
