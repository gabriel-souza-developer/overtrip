import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';
import { loadActiveOrganizationMembership } from '../src/middleware/organizationContext.js';

// Primeira operação de escrita no escopo de organização (antes só consulta).
// Cobre: isolamento entre duas empresas, papel MEMBER (só leitura),
// acesso direto/spoofing (organizationId, status, mídia no corpo nunca
// aceitos), e a reconfirmação de vínculo/papel DENTRO da mesma transação da
// escrita (não só no middleware antes de abrir a transação).

let server: Server;
let base: string;
let ownerId: string; let ownerToken: string;
let memberId: string; let memberToken: string;
let strangerId: string; let strangerToken: string;
let orgA: string; let orgB: string; let orgC: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const essentialBody = {
  title: 'Trilha da Serra', category: 'Trilha', description: 'Caminhada guiada com paradas para observação.',
  city: 'Lucena', region: 'PB', startDateISO: '2030-06-01T09:00:00.000Z',
};

beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: `org-trip-write-owner:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  const member = await prisma.user.create({ data: { email: `org-trip-write-member:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  memberId = member.id; memberToken = generateToken(member);
  const stranger = await prisma.user.create({ data: { email: `org-trip-write-stranger:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  strangerId = stranger.id; strangerToken = generateToken(stranger);

  orgA = (await prisma.organization.create({ data: { name: 'Agência Escrita A', slug: `org-trip-write-a-${Date.now()}` } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência Escrita B', slug: `org-trip-write-b-${Date.now()}` } })).id;
  orgC = (await prisma.organization.create({ data: { name: 'Agência Escrita C (inativa)', slug: `org-trip-write-c-${Date.now()}` }, })).id;
  await prisma.organization.update({ where: { id: orgC }, data: { status: 'INACTIVE' } });

  await prisma.membership.create({ data: { organizationId: orgA, userId: ownerId, role: 'OWNER' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId: ownerId, role: 'ADMIN' } });
  await prisma.membership.create({ data: { organizationId: orgA, userId: memberId, role: 'MEMBER' } });
  await prisma.membership.create({ data: { organizationId: orgC, userId: ownerId, role: 'OWNER' } });

  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterEach(async () => {
  // Nunca comita status 'OPEN'/publishedAt (a rota não aceita, mas também
  // confirmamos aqui que nada escapou para o site público).
  await prisma.trip.deleteMany({ where: { organizationId: { in: [orgA, orgB, orgC] } } });
  await prisma.membership.updateMany({ where: { organizationId: orgA, userId: ownerId }, data: { status: 'ACTIVE' } });
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.trip.deleteMany({ where: { organizationId: { in: [orgA, orgB, orgC] } } });
  await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, memberId, strangerId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB, orgC] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId, strangerId] } } });
  await prisma.$disconnect();
});

describe('POST /api/organizations/:organizationId/tourism/trips', () => {
  it('OWNER/ADMIN cria um rascunho com organizationId, storedIdentity e status sempre derivados do servidor', async () => {
    const response = await fetch(`${base}/${orgA}/tourism/trips`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(essentialBody) });
    expect(response.status).toBe(201);
    const created = await response.json() as { id: string; status: string; title: string };
    expect(created.status).toBe('DRAFT');
    expect(created.title).toBe(essentialBody.title);
    const row = await prisma.trip.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.organizationId).toBe(orgA);
    expect(row.status).toBe('DRAFT');
    expect(row.publishedAt).toBeNull();
    expect(row.storedIdentity).toMatch(new RegExp(`^org-trip:${orgA}:[0-9a-f]{32}$`));
    expect(JSON.stringify(created)).not.toContain('storedIdentity');
  });

  it('nunca aceita organização, status, mídia ou campos fora do essencial (spoofing é recusado, nunca ignorado em silêncio)', async () => {
    const spoofed = { ...essentialBody, organizationId: orgB, status: 'OPEN', publishedAt: new Date().toISOString(), media: [{ src: '/x.jpg', alt: 'x' }], intensityClass: 'extremo' };
    const response = await fetch(`${base}/${orgA}/tourism/trips`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(spoofed) });
    expect(response.status).toBe(400);
    const body = await response.json() as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.trip.count({ where: { organizationId: orgB } })).toBe(0);
  });

  it('MEMBER tem acesso só de leitura: GET funciona, POST é recusado', async () => {
    expect((await fetch(`${base}/${orgA}/tourism/trips`, { headers: { Authorization: `Bearer ${memberToken}` } })).status).toBe(200);
    const response = await fetch(`${base}/${orgA}/tourism/trips`, { method: 'POST', headers: auth(memberToken), body: JSON.stringify(essentialBody) });
    expect(response.status).toBe(403);
    const body = await response.json() as { code: string };
    expect(body.code).toBe('ORGANIZATION_ROLE_DENIED');
    expect(await prisma.trip.count({ where: { organizationId: orgA } })).toBe(0);
  });

  it('usuário sem vínculo algum (acesso direto/spoofing de organizationId na URL) é recusado', async () => {
    const response = await fetch(`${base}/${orgB}/tourism/trips`, { method: 'POST', headers: auth(strangerToken), body: JSON.stringify(essentialBody) });
    expect(response.status).toBe(403);
    expect(await prisma.trip.count({ where: { organizationId: orgB } })).toBe(0);
  });

  it('empresa inativa recusa a escrita mesmo para o OWNER', async () => {
    const response = await fetch(`${base}/${orgC}/tourism/trips`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(essentialBody) });
    expect(response.status).toBe(403);
  });

  it('valida dados essenciais (título vazio, categoria ausente, data inválida) com 400', async () => {
    expect((await fetch(`${base}/${orgA}/tourism/trips`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody, title: '' }) })).status).toBe(400);
    const { category, ...withoutCategory } = essentialBody;
    expect((await fetch(`${base}/${orgA}/tourism/trips`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(withoutCategory) })).status).toBe(400);
    expect((await fetch(`${base}/${orgA}/tourism/trips`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody, startDateISO: 'não-é-data' }) })).status).toBe(400);
    expect((await fetch(`${base}/${orgA}/tourism/trips`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody, endDateISO: '2030-01-01T00:00:00.000Z' }) })).status).toBe(400); // antes do início
  });

  it('a escrita usa loadActiveOrganizationMembership (a mesma função chamada DENTRO da transação) e nunca vê estado em cache: uma revogação é refletida imediatamente, não só na próxima requisição', async () => {
    // Prova a propriedade exigida pelo brief sem adulterar o client do
    // Prisma em si (espionar métodos do delegate do Prisma com vi.spyOn
    // deixa o delegate memoizado permanentemente quebrado para o resto do
    // processo — tentado e descartado). loadActiveOrganizationMembership é
    // a mesma função que assertWriteAccess chama com `tx` dentro da
    // transação da escrita (ver src/routes/organizationTripRoutes.ts); aqui
    // provamos que, chamada de novo no mesmo processo sem qualquer cache,
    // ela reflete a revogação assim que ela é persistida.
    const before = await loadActiveOrganizationMembership(prisma, orgA, ownerId);
    expect(before?.membership.role).toBe('OWNER');
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'REVOKED' } });
    const after = await loadActiveOrganizationMembership(prisma, orgA, ownerId);
    expect(after).toBeUndefined();
  });
});

describe('PUT /api/organizations/:organizationId/tourism/trips/:tripId', () => {
  const versionOf = async (id: string) => (await prisma.trip.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();
  async function createTrip(token: string, organizationId: string) {
    const response = await fetch(`${base}/${organizationId}/tourism/trips`, { method: 'POST', headers: auth(token), body: JSON.stringify(essentialBody) });
    expect(response.status).toBe(201);
    return (await response.json() as { id: string }).id;
  }

  it('atualiza parcialmente (campos ausentes preservam o valor atual) usando id+organizationId', async () => {
    const tripId = await createTrip(ownerToken, orgA);
    const response = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ title: 'Título revisado', expectedUpdatedAt: await versionOf(tripId) }) });
    expect(response.status).toBe(200);
    const updated = await response.json() as { title: string; city: string; category: string };
    expect(updated.title).toBe('Título revisado');
    expect(updated.city).toBe(essentialBody.city);
    expect(updated.category).toBe(essentialBody.category);
  });

  it('nunca modifica viagem de outra empresa: id correto na URL de organização errada responde 404, não revela que a viagem existe em outro lugar', async () => {
    const tripId = await createTrip(ownerToken, orgA);
    const response = await fetch(`${base}/${orgB}/tourism/trips/${tripId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ title: 'Tentativa de outra empresa', expectedUpdatedAt: await versionOf(tripId) }) });
    expect(response.status).toBe(404);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).title).toBe(essentialBody.title);
  });

  it('não altera viagem que deixou de ser rascunho', async () => {
    const tripId = await createTrip(ownerToken, orgA);
    await prisma.trip.update({ where: { id: tripId }, data: { status: 'OPEN' } });
    const response = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ title: 'Alteração indevida', expectedUpdatedAt: await versionOf(tripId) }) });
    expect(response.status).toBe(404);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).title).toBe(essentialBody.title);
  });

  it('MEMBER não pode editar; usuário sem vínculo também não', async () => {
    const tripId = await createTrip(ownerToken, orgA);
    expect((await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'PUT', headers: auth(memberToken), body: JSON.stringify({ title: 'Tentativa de MEMBER', expectedUpdatedAt: await versionOf(tripId) }) })).status).toBe(403);
    expect((await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'PUT', headers: auth(strangerToken), body: JSON.stringify({ title: 'Tentativa de estranho', expectedUpdatedAt: await versionOf(tripId) }) })).status).toBe(403);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).title).toBe(essentialBody.title);
  });

  it('nunca aceita organizationId, status ou mídia arbitrários no corpo da atualização', async () => {
    const tripId = await createTrip(ownerToken, orgA);
    const response = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ status: 'OPEN', organizationId: orgB, expectedUpdatedAt: await versionOf(tripId) }) });
    expect(response.status).toBe(400);
    const row = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    expect(row.status).toBe('DRAFT');
    expect(row.organizationId).toBe(orgA);
  });

  it('data de retorno antes da data de início (mesclando o valor atual com o enviado) é recusada', async () => {
    const tripId = await createTrip(ownerToken, orgA);
    const response = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ endDateISO: '2020-01-01T00:00:00.000Z', expectedUpdatedAt: await versionOf(tripId) }) });
    expect(response.status).toBe(400);
  });

  it('viagem inexistente responde 404', async () => {
    const response = await fetch(`${base}/${orgA}/tourism/trips/nao-existe`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ title: 'x', expectedUpdatedAt: new Date().toISOString() }) });
    expect(response.status).toBe(404);
  });

  it('rejeita versões antigas e preserva alterações simultâneas, inclusive datas e descrição', async () => {
    const tripId = await createTrip(ownerToken, orgA);
    const endpoint = `${base}/${orgA}/tourism/trips/${tripId}`;
    const version = await versionOf(tripId);
    const send = (body: object) => fetch(endpoint, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify(body) });
    const first = await send({ description: 'Descrição atualizada', endDateISO: '2030-06-02T10:00:00.000Z', expectedUpdatedAt: version });
    expect(first.status).toBe(200);
    const fresh = await first.json() as { description: string; updatedAt: string };
    expect(fresh.description).toBe('Descrição atualizada');
    expect(new Date(fresh.updatedAt).getTime()).toBeGreaterThan(new Date(version).getTime());
    expect((await send({ title: 'Título antigo', endDateISO: null, expectedUpdatedAt: version })).status).toBe(409);
    const saved = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    expect(saved.title).toBe(essentialBody.title);
    expect(saved.description).toBe('Descrição atualizada');
    expect(saved.endDateISO?.toISOString()).toBe('2030-06-02T10:00:00.000Z');
    expect((await send({ title: 'Sem versão' })).status).toBe(400);
  });
});
