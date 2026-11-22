import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

// Lacuna identificada comparando o painel da empresa com o operador legado:
// viagens, destinos e memórias podiam ser criados e editados pela própria
// empresa, mas nunca excluídos (um rascunho de teste ou duplicado ficava
// preso para sempre). Esta rota cobre a exclusão de viagem, com a mesma
// defesa em duas camadas da exclusão legada (tripService.delete): bloqueia
// quando há reserva/interessado (409) ou visita/memória (400) associados, e
// nunca aplica a exclusão quando a contagem pelo próprio escopo e a
// contagem global não coincidem.

let server: Server;
let base: string;
let ownerId: string; let ownerToken: string;
let memberId: string; let memberToken: string;
let strangerId: string; let strangerToken: string;
let orgA: string; let orgB: string;
const tripBase = { category: 'Teste', description: 'Exclusão', city: 'Cidade', region: 'PB', intensityClass: 'leve', includes: '[]', media: '[]', startDateISO: new Date('2031-06-15T12:00:00.000Z') };
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const createdStoredIdentities: string[] = [];

async function createOrgTrip(organizationId: string, titleSuffix: string, overrides: Partial<Parameters<typeof prisma.trip.create>[0]['data']> = {}) {
  const storedIdentity = `org-trip-delete-test:${organizationId}:${titleSuffix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  createdStoredIdentities.push(storedIdentity);
  const trip = await prisma.trip.create({ data: { ...tripBase, title: `Exclusão ${titleSuffix}`, storedIdentity, organizationId, ...overrides } });
  return trip.id;
}

beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: `org-trip-delete-owner:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  const member = await prisma.user.create({ data: { email: `org-trip-delete-member:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  memberId = member.id; memberToken = generateToken(member);
  const stranger = await prisma.user.create({ data: { email: `org-trip-delete-stranger:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  strangerId = stranger.id; strangerToken = generateToken(stranger);

  orgA = (await prisma.organization.create({ data: { name: 'Exclusão A', slug: `org-trip-delete-a-${Date.now()}` } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Exclusão B', slug: `org-trip-delete-b-${Date.now()}` } })).id;
  await prisma.membership.create({ data: { organizationId: orgA, userId: ownerId, role: 'OWNER' } });
  await prisma.membership.create({ data: { organizationId: orgA, userId: memberId, role: 'MEMBER' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId: strangerId, role: 'OWNER' } });

  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.reservation.deleteMany({ where: { trip: { storedIdentity: { startsWith: 'org-trip-delete-test:' } } } });
  await prisma.lead.deleteMany({ where: { trip: { storedIdentity: { startsWith: 'org-trip-delete-test:' } } } });
  await prisma.visit.deleteMany({ where: { trip: { storedIdentity: { startsWith: 'org-trip-delete-test:' } } } });
  await prisma.galleryEntry.deleteMany({ where: { trip: { storedIdentity: { startsWith: 'org-trip-delete-test:' } } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: 'org-trip-delete-test:' } } });
  await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, memberId, strangerId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId, strangerId] } } });
  await prisma.$disconnect();
});

describe('DELETE /organizations/:organizationId/tourism/trips/:tripId', () => {
  it('exige sessão: 401 sem token', async () => {
    const tripId = await createOrgTrip(orgA, 'sem-sessao');
    const res = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('MEMBER não pode excluir: 403, e a viagem continua existindo', async () => {
    const tripId = await createOrgTrip(orgA, 'member-nega');
    const res = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'DELETE', headers: auth(memberToken) });
    expect(res.status).toBe(403);
    expect(await prisma.trip.findUnique({ where: { id: tripId } })).not.toBeNull();
  });

  it('isolamento cruzado: quem não tem vínculo com a empresa não exclui (403), e a viagem permanece intacta', async () => {
    const tripId = await createOrgTrip(orgA, 'estranho-nega');
    const res = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'DELETE', headers: auth(strangerToken) });
    expect(res.status).toBe(403);
    expect(await prisma.trip.findUnique({ where: { id: tripId } })).not.toBeNull();
  });

  it('OWNER exclui uma viagem própria sem vínculos: 204, e a leitura seguinte dá 404', async () => {
    const tripId = await createOrgTrip(orgA, 'owner-exclui');
    const res = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'DELETE', headers: auth(ownerToken) });
    expect(res.status).toBe(204);
    expect(await prisma.trip.findUnique({ where: { id: tripId } })).toBeNull();

    const read = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { headers: auth(ownerToken) });
    expect(read.status).toBe(404);
  });

  it('não existe ou já foi excluída: 404 (idempotente, nunca 500)', async () => {
    const tripId = await createOrgTrip(orgA, 'dupla-exclusao');
    expect((await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'DELETE', headers: auth(ownerToken) })).status).toBe(204);
    const again = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'DELETE', headers: auth(ownerToken) });
    expect(again.status).toBe(404);
  });

  it('combinar o organizationId de orgB (onde o requisitante tem OWNER) com o id de uma viagem de orgA dá 404, e a viagem de orgA não é afetada', async () => {
    const tripId = await createOrgTrip(orgA, 'cruzada-outra-empresa');
    // strangerToken é OWNER de orgB (passa o middleware de vínculo), mas a
    // viagem buscada dentro da transação é filtrada por organizationId=orgB
    // — uma viagem de orgA nunca é encontrada por essa combinação, mesmo
    // com um papel de escrita válido na empresa errada.
    const res = await fetch(`${base}/${orgB}/tourism/trips/${tripId}`, { method: 'DELETE', headers: auth(strangerToken) });
    expect(res.status).toBe(404);
    expect(await prisma.trip.findUnique({ where: { id: tripId } })).not.toBeNull();
  });

  it('bloqueia exclusão com reserva associada (409) e não exclui nada', async () => {
    const tripId = await createOrgTrip(orgA, 'com-reserva');
    await prisma.reservation.create({ data: { organizationId: orgA, tripId, customerName: 'Cliente Teste', seats: 1, totalCents: 10000 } });
    const res = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'DELETE', headers: auth(ownerToken) });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('reservas ou interessados');
    expect(await prisma.trip.findUnique({ where: { id: tripId } })).not.toBeNull();
  });

  it('bloqueia exclusão com interessado (lead) associado (409) e não exclui nada', async () => {
    const tripId = await createOrgTrip(orgA, 'com-lead');
    await prisma.lead.create({ data: { organizationId: orgA, tripId, name: 'Interessado Teste' } });
    const res = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'DELETE', headers: auth(ownerToken) });
    expect(res.status).toBe(409);
    expect(await prisma.trip.findUnique({ where: { id: tripId } })).not.toBeNull();
  });

  it('bloqueia exclusão com destino visitado associado (400) e não exclui nada', async () => {
    const tripId = await createOrgTrip(orgA, 'com-visita');
    await prisma.visit.create({ data: { organizationId: orgA, tripId, title: 'Visita Teste', city: 'Cidade', region: 'PB', storedIdentity: `visit-delete-test:${tripId}` } });
    const res = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'DELETE', headers: auth(ownerToken) });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('visitas ou memórias');
    expect(await prisma.trip.findUnique({ where: { id: tripId } })).not.toBeNull();
  });

  it('bloqueia exclusão com memória (galeria) associada (400) e não exclui nada', async () => {
    const tripId = await createOrgTrip(orgA, 'com-galeria');
    await prisma.galleryEntry.create({ data: { organizationId: orgA, tripId, title: 'Memória Teste', date: new Date(), dateDisplay: 'hoje', description: 'd', images: '[]', orderIndex: 0, storedIdentity: `gallery-delete-test:${tripId}`, source: 'manual' } });
    const res = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'DELETE', headers: auth(ownerToken) });
    expect(res.status).toBe(400);
    expect(await prisma.trip.findUnique({ where: { id: tripId } })).not.toBeNull();
  });

  it('depois de remover a associação, a mesma viagem pode ser excluída', async () => {
    const tripId = await createOrgTrip(orgA, 'desassociar-depois');
    const visit = await prisma.visit.create({ data: { organizationId: orgA, tripId, title: 'Visita Temporária', city: 'Cidade', region: 'PB', storedIdentity: `visit-delete-test:${tripId}` } });
    expect((await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'DELETE', headers: auth(ownerToken) })).status).toBe(400);

    await prisma.visit.delete({ where: { id: visit.id } });
    const res = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'DELETE', headers: auth(ownerToken) });
    expect(res.status).toBe(204);
    expect(await prisma.trip.findUnique({ where: { id: tripId } })).toBeNull();
  });

  it('não exclui viagem fora do status rascunho, mesmo sendo da própria empresa (defesa em profundidade)', async () => {
    const tripId = await createOrgTrip(orgA, 'nao-rascunho', { status: 'OPEN', publishedAt: new Date() });
    const res = await fetch(`${base}/${orgA}/tourism/trips/${tripId}`, { method: 'DELETE', headers: auth(ownerToken) });
    expect(res.status).toBe(404);
    expect(await prisma.trip.findUnique({ where: { id: tripId } })).not.toBeNull();
  });

  it('empresa inativa recusa a escrita mesmo para quem tem vínculo OWNER ativo nela', async () => {
    const inactiveOrg = await prisma.organization.create({ data: { name: 'Exclusão Inativa', slug: `org-trip-delete-inactive-${Date.now()}`, status: 'INACTIVE' } });
    await prisma.membership.create({ data: { organizationId: inactiveOrg.id, userId: ownerId, role: 'OWNER' } });
    const tripId = await createOrgTrip(inactiveOrg.id, 'empresa-inativa');
    const res = await fetch(`${base}/${inactiveOrg.id}/tourism/trips/${tripId}`, { method: 'DELETE', headers: auth(ownerToken) });
    expect(res.status).toBe(403);
    await prisma.trip.deleteMany({ where: { organizationId: inactiveOrg.id } });
    await prisma.membership.deleteMany({ where: { organizationId: inactiveOrg.id } });
    await prisma.organization.delete({ where: { id: inactiveOrg.id } });
  });
});
