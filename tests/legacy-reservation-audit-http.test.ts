import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';
import { config } from '../src/config.js';

// Lacuna encontrada por revisão independente: com LEGACY_TOURISM_ORGANIZATION_ID
// configurado (modo compartilhado — ver legacyTourismScope.ts), a operação
// legada (reservationRoutes.ts) podia mutar reservas de uma empresa REAL sem
// gravar ReservationAuditLog, mesmo que o histórico dessa empresa (GET
// /api/organizations/:id/tourism/reservations/:id/audit) parecesse completo
// na tela. Este arquivo prova:
// 1) fora do modo compartilhado (organizationId null), continua sem
//    nenhuma entrada — comportamento de reserva legada sem empresa não muda;
// 2) no modo compartilhado, toda mutação pela rota legada grava uma entrada
//    com a organização configurada, e essa entrada aparece no MESMO
//    endpoint de leitura que a empresa já usa — fechando a lacuna;
// 3) concorrência (duas escritas simultâneas) e falha induzida na própria
//    gravação da auditoria revertem a mutação inteira, nas duas rotas
//    (legada e de organização) — nunca existe entrada de auditoria sem a
//    mudança correspondente, nem o oposto.

let server: Server;
let legacyBase: string;
let orgBase: string;
let ownerId: string; let ownerToken: string;
let orgSharedId: string;
let tripSharedId: string;
let tripNullId: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

function auditCountFor(reservationId: string) {
  return prisma.reservationAuditLog.count({ where: { reservationId } });
}

async function createLegacy(tripId: string, overrides: Record<string, unknown> = {}) {
  const response = await fetch(legacyBase, {
    method: 'POST', headers: auth(ownerToken),
    body: JSON.stringify({ tripId, customerName: 'Cliente Legado', customerPhone: '83999990000', seats: 2, totalCents: 100000, ...overrides }),
  });
  expect(response.status).toBe(201);
  return await response.json() as { id: string; updatedAt: string; organizationId: string | null; status: string };
}

async function createOrgScoped(organizationId: string, tripId: string) {
  const response = await fetch(`${orgBase}/${organizationId}/tourism/reservations`, {
    method: 'POST', headers: auth(ownerToken),
    body: JSON.stringify({ tripId, customerName: 'Cliente Organização', customerPhone: '83999990000', seats: 2, totalCents: 100000 }),
  });
  expect(response.status).toBe(201);
  return await response.json() as { id: string; updatedAt: string };
}

// Trigger de falha usada só para o teste de rollback: dispara exatamente na
// gravação de auditoria desta reserva, nunca em outra. O id é sempre um
// cuid gerado pelo Prisma (só [0-9a-z]), validado antes de entrar no SQL —
// nenhum valor de fora do teste chega aqui.
function triggerName(reservationId: string): string {
  return `trg_fail_audit_${reservationId}`;
}
async function installFailingAuditTrigger(reservationId: string) {
  if (!/^[a-z0-9]+$/i.test(reservationId)) throw new Error('id inseguro para o gatilho de teste');
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER "${triggerName(reservationId)}" BEFORE INSERT ON "ReservationAuditLog" WHEN NEW."reservationId" = '${reservationId}' BEGIN SELECT RAISE(ABORT, 'simulated audit insert failure'); END;`
  );
}
async function dropFailingAuditTrigger(reservationId: string) {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName(reservationId)}"`);
}

beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: `legacy-audit-owner:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin', legacyAccess: true } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  orgSharedId = (await prisma.organization.create({ data: { name: 'Agência Compartilhada', slug: `legacy-audit-shared-${Date.now()}` } })).id;
  await prisma.membership.create({ data: { organizationId: orgSharedId, userId: ownerId, role: 'OWNER' } });

  const trip = { category: 'Teste', description: 'Teste', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'light', includes: '[]', media: '[]' };
  tripSharedId = (await prisma.trip.create({ data: { ...trip, organizationId: orgSharedId, storedIdentity: `legacy-audit-trip-shared-${Date.now()}`, title: 'Viagem Compartilhada' } })).id;
  // Sem organizationId: só assim entra no escopo legado quando NÃO há
  // LEGACY_TOURISM_ORGANIZATION_ID configurado.
  tripNullId = (await prisma.trip.create({ data: { ...trip, storedIdentity: `legacy-audit-trip-null-${Date.now()}`, title: 'Viagem Sem Empresa' } })).id;

  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as AddressInfo).port;
  legacyBase = `http://127.0.0.1:${port}/api/reservations`;
  orgBase = `http://127.0.0.1:${port}/api/organizations`;
});

afterEach(async () => {
  // Nunca deixar o modo compartilhado vazar para o próximo teste deste
  // arquivo, nem para outro arquivo que reutilize o mesmo processo/banco.
  config.legacyTourismOrganizationId = null;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  config.legacyTourismOrganizationId = null;
  await prisma.reservationAuditLog.deleteMany({ where: { organizationId: orgSharedId } });
  await prisma.reservationInstallment.deleteMany({ where: { reservation: { tripId: { in: [tripSharedId, tripNullId] } } } });
  await prisma.reservation.deleteMany({ where: { tripId: { in: [tripSharedId, tripNullId] } } });
  // Trip referencia Organization com onDelete: Restrict — precisa ser
  // removida antes da empresa, nunca depois.
  await prisma.trip.deleteMany({ where: { id: { in: [tripSharedId, tripNullId] } } });
  await prisma.membership.deleteMany({ where: { userId: ownerId } });
  await prisma.organization.deleteMany({ where: { id: orgSharedId } });
  await prisma.user.delete({ where: { id: ownerId } });
  await prisma.$disconnect();
});

describe('modo legado NÃO compartilhado (LEGACY_TOURISM_ORGANIZATION_ID ausente): continua sem trilha', () => {
  it('criar, editar e mexer em parcelas de uma reserva sem empresa não grava nenhuma entrada', async () => {
    expect(config.legacyTourismOrganizationId).toBeNull();
    const created = await createLegacy(tripNullId);
    expect(created.organizationId).toBeNull();

    await fetch(`${legacyBase}/${created.id}`, { method: 'PATCH', headers: auth(ownerToken), body: JSON.stringify({ status: 'CONFIRMED' }) });
    const installmentRes = await fetch(`${legacyBase}/${created.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 5000 }) });
    expect(installmentRes.status).toBe(201);
    const installment = await installmentRes.json() as { id: string };
    await fetch(`${legacyBase}/${created.id}/installments/${installment.id}`, { method: 'PATCH', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 4000 }) });
    await fetch(`${legacyBase}/${created.id}/installments/${installment.id}`, { method: 'DELETE', headers: auth(ownerToken) });

    expect(await auditCountFor(created.id)).toBe(0);
    await prisma.reservationInstallment.deleteMany({ where: { reservationId: created.id } });
    await prisma.reservation.delete({ where: { id: created.id } });
  });
});

describe('solicitação recebida pelo WhatsApp: o sinal de 50% precede a confirmação', () => {
  it('mantém fora do Financeiro antes do sinal, aceita 50% recebido e impede retirar o mínimo depois', async () => {
    config.legacyTourismOrganizationId = null;
    const created = await createLegacy(tripNullId, { totalCents: 100_000 });
    await prisma.reservation.update({ where: { id: created.id }, data: { source: 'WHATSAPP_N8N', needsReview: true, notes: 'Valor não calculado: corrija antes de confirmar.' } });

    // Apagar ou editar a nota não pode transformar preço desconhecido em TRIP grátis.
    expect((await fetch(`${legacyBase}/${created.id}`, { method: 'PATCH', headers: auth(ownerToken), body: JSON.stringify({ totalCents: 0, notes: null }) })).status).toBe(200);
    expect((await fetch(`${legacyBase}/${created.id}`, { method: 'PATCH', headers: auth(ownerToken), body: JSON.stringify({ status: 'CONFIRMED' }) })).status).toBe(409);
    await fetch(`${legacyBase}/${created.id}`, { method: 'PATCH', headers: auth(ownerToken), body: JSON.stringify({ totalCents: 100_000, notes: 'Preço confirmado pela equipe.' }) });

    const confirmEarly = await fetch(`${legacyBase}/${created.id}`, { method: 'PATCH', headers: auth(ownerToken), body: JSON.stringify({ status: 'CONFIRMED' }) });
    expect(confirmEarly.status).toBe(409);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } })).status).toBe('PENDING');

    const add = async (amountCents: number) => {
      const response = await fetch(`${legacyBase}/${created.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents }) });
      expect(response.status).toBe(201);
      return await response.json() as { id: string };
    };
    const first = await add(49_999);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } })).needsReview).toBe(true);
    const markPaid = async (id: string, paid: boolean) => fetch(`${legacyBase}/${created.id}/installments/${id}`, { method: 'PATCH', headers: auth(ownerToken), body: JSON.stringify({ paid }) });
    expect((await markPaid(first.id, true)).status).toBe(200);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } })).needsReview).toBe(true);

    const finalCent = await add(1);
    expect((await markPaid(finalCent.id, true)).status).toBe(200);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } })).needsReview).toBe(false);
    expect((await fetch(`${legacyBase}/${created.id}`, { method: 'PATCH', headers: auth(ownerToken), body: JSON.stringify({ status: 'CONFIRMED' }) })).status).toBe(200);
    expect((await markPaid(first.id, false)).status).toBe(409);

    await prisma.reservation.delete({ where: { id: created.id } });
  });
});

describe('modo legado COMPARTILHADO (LEGACY_TOURISM_ORGANIZATION_ID = empresa real): grava e fecha a lacuna', () => {
  it('criar pela rota legada grava RESERVATION_CREATED com a organização configurada', async () => {
    config.legacyTourismOrganizationId = orgSharedId;
    const created = await createLegacy(tripSharedId);
    expect(created.organizationId).toBe(orgSharedId);

    const rows = await prisma.reservationAuditLog.findMany({ where: { reservationId: created.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('RESERVATION_CREATED');
    expect(rows[0].organizationId).toBe(orgSharedId);
    expect(rows[0].actorUserId).toBe(ownerId);
  });

  it('editar reserva e mexer em parcelas pela rota legada grava uma entrada por mutação, na mesma ordem da rota de organização', async () => {
    config.legacyTourismOrganizationId = orgSharedId;
    const created = await createLegacy(tripSharedId);

    await fetch(`${legacyBase}/${created.id}`, { method: 'PATCH', headers: auth(ownerToken), body: JSON.stringify({ status: 'CONFIRMED' }) });
    const installmentRes = await fetch(`${legacyBase}/${created.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 5000 }) });
    expect(installmentRes.status).toBe(201);
    const installment = await installmentRes.json() as { id: string };
    await fetch(`${legacyBase}/${created.id}/installments/${installment.id}`, { method: 'PATCH', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 4000 }) });
    await fetch(`${legacyBase}/${created.id}/installments/${installment.id}`, { method: 'DELETE', headers: auth(ownerToken) });

    const rows = await prisma.reservationAuditLog.findMany({ where: { reservationId: created.id }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((row) => row.action)).toEqual(['RESERVATION_CREATED', 'RESERVATION_UPDATED', 'INSTALLMENT_CREATED', 'INSTALLMENT_UPDATED', 'INSTALLMENT_DELETED']);
    expect(rows.every((row) => row.organizationId === orgSharedId)).toBe(true);
  });

  it('o histórico lido pelo endpoint da empresa inclui ações feitas pela rota legada: a lacuna está fechada', async () => {
    config.legacyTourismOrganizationId = orgSharedId;
    // Criada pela rota LEGADA...
    const created = await createLegacy(tripSharedId);
    // ...e também editada pela rota de ORGANIZAÇÃO, na mesma reserva.
    const current = await (await fetch(`${orgBase}/${orgSharedId}/tourism/reservations/${created.id}`, { headers: auth(ownerToken) })).json() as { updatedAt: string };
    const updateRes = await fetch(`${orgBase}/${orgSharedId}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ status: 'CONFIRMED', expectedUpdatedAt: current.updatedAt }) });
    expect(updateRes.status).toBe(200);

    const page = await (await fetch(`${orgBase}/${orgSharedId}/tourism/reservations/${created.id}/audit`, { headers: auth(ownerToken) })).json() as { data: { action: string }[] };
    // Mais recente primeiro: a edição (rota de organização) aparece antes da
    // criação (rota legada) — as duas superfícies alimentam o MESMO histórico.
    expect(page.data.map((entry) => entry.action)).toEqual(['RESERVATION_UPDATED', 'RESERVATION_CREATED']);
  });

  it('duas criações de parcela concorrentes pela rota legada: a vencedora grava auditoria, a derrotada não grava nada', async () => {
    config.legacyTourismOrganizationId = orgSharedId;
    // Total exato para só UMA das duas parcelas de 1000 caber (a rota legada
    // não recebe versão do cliente como a de organização — o SQLite serializa
    // as duas transações da mesma reserva, e a segunda, já vendo a alocação
    // da primeira, perde pela regra de negócio, nunca pela versão).
    const created = await createLegacy(tripSharedId, { totalCents: 1500 });
    expect(await auditCountFor(created.id)).toBe(1); // só a criação, até aqui

    const [first, second] = await Promise.all([
      fetch(`${legacyBase}/${created.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 1000 }) }),
      fetch(`${legacyBase}/${created.id}/installments`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ amountCents: 1000 }) }),
    ]);
    const statuses = [first.status, second.status].sort((a, b) => a - b);
    // Uma das duas sempre vence (201); a outra, mesmo disparada ao mesmo
    // tempo, nunca soma com a primeira acima do total da reserva — nunca as
    // duas vencem, nunca as duas perdem.
    expect(statuses).toEqual([201, 409]);
    // Criação da reserva + exatamente uma parcela vencedora: nunca duas, nunca zero.
    expect(await auditCountFor(created.id)).toBe(2);
  });

  it('falha induzida na gravação da auditoria reverte a mutação inteira (rota LEGADA, modo compartilhado)', async () => {
    config.legacyTourismOrganizationId = orgSharedId;
    const created = await createLegacy(tripSharedId);
    expect(created.status).toBe('PENDING');
    expect(await auditCountFor(created.id)).toBe(1);

    await installFailingAuditTrigger(created.id);
    try {
      const response = await fetch(`${legacyBase}/${created.id}`, { method: 'PATCH', headers: auth(ownerToken), body: JSON.stringify({ status: 'CONFIRMED' }) });
      // O status exato depende de como o Prisma classifica o erro do SQLite
      // levantado pelo gatilho; o que importa é que a escrita NUNCA é aceita.
      expect(response.ok).toBe(false);
      const reservationNow = await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } });
      // A mutação (mudança de status) nunca se concretizou: rollback da
      // transação inteira, não só da linha de auditoria que falhou.
      expect(reservationNow.status).toBe('PENDING');
      expect(await auditCountFor(created.id)).toBe(1);
    } finally {
      await dropFailingAuditTrigger(created.id);
    }
  });

  it('falha induzida na gravação da auditoria reverte a mutação inteira (rota DE ORGANIZAÇÃO)', async () => {
    const created = await createOrgScoped(orgSharedId, tripSharedId);
    expect(await auditCountFor(created.id)).toBe(1);

    await installFailingAuditTrigger(created.id);
    try {
      const response = await fetch(`${orgBase}/${orgSharedId}/tourism/reservations/${created.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ status: 'CONFIRMED', expectedUpdatedAt: created.updatedAt }) });
      expect(response.ok).toBe(false);
      const reservationNow = await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } });
      expect(reservationNow.status).toBe('PENDING');
      expect(await auditCountFor(created.id)).toBe(1);
    } finally {
      await dropFailingAuditTrigger(created.id);
    }
  });
});
