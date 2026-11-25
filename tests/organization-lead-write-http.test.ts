import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';
import { loadActiveOrganizationMembership } from '../src/middleware/organizationContext.js';

// Primeira operação de escrita de interessados (CRM) no escopo de
// organização. Cobre: isolamento entre duas empresas, MEMBER sem qualquer
// acesso (nem leitura), acesso direto/spoofing (organizationId, tripId,
// campos não permitidos), exigência de contato e a reconfirmação de
// vínculo/papel que a escrita faz DENTRO da própria transação.

let server: Server;
let base: string;
let ownerId: string; let ownerToken: string;
let memberId: string; let memberToken: string;
let strangerId: string; let strangerToken: string;
let orgA: string; let orgB: string; let orgC: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const essentialBody = { name: 'Maria Interessada', phone: '83999990000', email: 'maria@example.test', stage: 'NEW', notes: 'Pediu orçamento por WhatsApp.' };

beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: `org-lead-write-owner:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  const member = await prisma.user.create({ data: { email: `org-lead-write-member:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  memberId = member.id; memberToken = generateToken(member);
  const stranger = await prisma.user.create({ data: { email: `org-lead-write-stranger:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  strangerId = stranger.id; strangerToken = generateToken(stranger);

  orgA = (await prisma.organization.create({ data: { name: 'Agência CRM A', slug: `org-lead-write-a-${Date.now()}` } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência CRM B', slug: `org-lead-write-b-${Date.now()}` } })).id;
  orgC = (await prisma.organization.create({ data: { name: 'Agência CRM C (inativa)', slug: `org-lead-write-c-${Date.now()}` } })).id;
  await prisma.organization.update({ where: { id: orgC }, data: { status: 'INACTIVE' } });

  await prisma.membership.create({ data: { organizationId: orgA, userId: ownerId, role: 'OWNER' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId: ownerId, role: 'ADMIN' } });
  await prisma.membership.create({ data: { organizationId: orgA, userId: memberId, role: 'MEMBER' } });
  await prisma.membership.create({ data: { organizationId: orgC, userId: ownerId, role: 'OWNER' } });

  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterEach(async () => {
  await prisma.lead.deleteMany({ where: { organizationId: { in: [orgA, orgB, orgC] } } });
  await prisma.membership.updateMany({ where: { organizationId: orgA, userId: ownerId }, data: { status: 'ACTIVE' } });
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.lead.deleteMany({ where: { organizationId: { in: [orgA, orgB, orgC] } } });
  await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, memberId, strangerId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB, orgC] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId, strangerId] } } });
  await prisma.$disconnect();
});

describe('POST /api/organizations/:organizationId/tourism/leads', () => {
  it('OWNER/ADMIN cadastra e pode consultar as próprias anotações', async () => {
    const response = await fetch(`${base}/${orgA}/tourism/leads`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(essentialBody) });
    expect(response.status).toBe(201);
    const created = await response.json() as { id: string; name: string; stage: string };
    expect(created.name).toBe(essentialBody.name);
    expect(created.stage).toBe('NEW');
    expect(JSON.stringify(created)).toContain('Pediu orçamento');
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.organizationId).toBe(orgA);
    expect(row.notes).toBe(essentialBody.notes);
    expect(row.tripId).toBeNull();
  });

  it('nunca aceita organizationId ou tripId arbitrários (spoofing é recusado)', async () => {
    const spoofed = { ...essentialBody, organizationId: orgB, tripId: 'alguma-viagem', responsible: 'Alguém', nextFollowUpAt: new Date().toISOString() };
    const response = await fetch(`${base}/${orgA}/tourism/leads`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(spoofed) });
    expect(response.status).toBe(400);
    const body = await response.json() as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.lead.count({ where: { organizationId: orgB } })).toBe(0);
  });

  it('permite acompanhamento e filtra etapa e contatos de hoje ou vencidos sem incluir outra empresa', async () => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const today = new Date(`${day}T12:00:00.000Z`);
    const yesterday = new Date(today.getTime() - 86400000);
    const tomorrow = new Date(today.getTime() + 86400000);
    const create = async (organization: string, name: string, stage: string, nextFollowUpAt: Date) => {
      const response = await fetch(`${base}/${organization}/tourism/leads`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody, name, stage, responsible: 'Ana', nextFollowUpAt: nextFollowUpAt.toISOString() }) });
      expect(response.status).toBe(201);
      return await response.json() as { id: string; responsible: string; nextFollowUpAt: string; updatedAt: string };
    };
    const due = await create(orgA, 'Hoje', 'CONTACTED', today);
    await create(orgA, 'Ontem', 'NEW', yesterday);
    await create(orgA, 'Amanhã', 'CONTACTED', tomorrow);
    await create(orgB, 'Empresa B', 'CONTACTED', yesterday);
    expect(due.responsible).toBe('Ana');
    const response = await fetch(`${base}/${orgA}/tourism/leads?stage=CONTACTED&followUp=due`, { headers: auth(ownerToken) });
    expect(response.status).toBe(200);
    const list = await response.json() as { data: { name: string }[]; pagination: { total: number } };
    expect(list.data.map(item => item.name)).toEqual(['Hoje']);
    expect(list.pagination.total).toBe(1);
    const update = await fetch(`${base}/${orgA}/tourism/leads/${due.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ responsible: null, nextFollowUpAt: null, expectedUpdatedAt: due.updatedAt }) });
    expect(update.status).toBe(200);
    const saved = await update.json() as { responsible: string | null; nextFollowUpAt: string | null };
    expect(saved.responsible).toBeNull();
    expect(saved.nextFollowUpAt).toBeNull();
  });

  it('exige nome e ao menos um contato (telefone ou e-mail)', async () => {
    expect((await fetch(`${base}/${orgA}/tourism/leads`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody, name: '' }) })).status).toBe(400);
    const { phone, email, ...withoutContact } = essentialBody;
    expect((await fetch(`${base}/${orgA}/tourism/leads`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(withoutContact) })).status).toBe(400);
    expect((await fetch(`${base}/${orgA}/tourism/leads`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...withoutContact, phone: '83988887777' }) })).status).toBe(201);
  });

  it('MEMBER não tem acesso algum (nem leitura, nem escrita) e usuário sem vínculo também não', async () => {
    expect((await fetch(`${base}/${orgA}/tourism/leads`, { headers: { Authorization: `Bearer ${memberToken}` } })).status).toBe(403);
    const response = await fetch(`${base}/${orgA}/tourism/leads`, { method: 'POST', headers: auth(memberToken), body: JSON.stringify(essentialBody) });
    expect(response.status).toBe(403);
    expect((await response.json() as { code: string }).code).toBe('ORGANIZATION_ROLE_DENIED');
    const strangerResponse = await fetch(`${base}/${orgB}/tourism/leads`, { method: 'POST', headers: auth(strangerToken), body: JSON.stringify(essentialBody) });
    expect(strangerResponse.status).toBe(403);
    expect(await prisma.lead.count({ where: { organizationId: { in: [orgA, orgB] } } })).toBe(0);
  });

  it('empresa inativa recusa a escrita mesmo para o OWNER', async () => {
    const response = await fetch(`${base}/${orgC}/tourism/leads`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(essentialBody) });
    expect(response.status).toBe(403);
  });

  it('a escrita usa loadActiveOrganizationMembership (a mesma função chamada DENTRO da transação) e nunca vê estado em cache: revogação é refletida imediatamente', async () => {
    const before = await loadActiveOrganizationMembership(prisma, orgA, ownerId);
    expect(before?.membership.role).toBe('OWNER');
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'REVOKED' } });
    const after = await loadActiveOrganizationMembership(prisma, orgA, ownerId);
    expect(after).toBeUndefined();
  });
});

describe('PUT /api/organizations/:organizationId/tourism/leads/:leadId', () => {
  const version = async (id: string) => (await prisma.lead.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();
  async function createLead(organizationId: string) {
    const response = await fetch(`${base}/${organizationId}/tourism/leads`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(essentialBody) });
    expect(response.status).toBe(201);
    return (await response.json() as { id: string }).id;
  }

  it('atualiza parcialmente (campos ausentes preservam o valor atual) usando id+organizationId', async () => {
    const leadId = await createLead(orgA);
    const response = await fetch(`${base}/${orgA}/tourism/leads/${leadId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ stage: 'CONTACTED', expectedUpdatedAt: await version(leadId) }) });
    expect(response.status).toBe(200);
    const updated = await response.json() as { stage: string; name: string; phone: string | null };
    expect(updated.stage).toBe('CONTACTED');
    expect(updated.name).toBe(essentialBody.name);
    expect(updated.phone).toBe(essentialBody.phone);
  });

  it('nunca modifica interessado de outra empresa: id correto na URL de organização errada responde 404', async () => {
    const leadId = await createLead(orgA);
    const response = await fetch(`${base}/${orgB}/tourism/leads/${leadId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ stage: 'WON', expectedUpdatedAt: await version(leadId) }) });
    expect(response.status).toBe(404);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).stage).toBe('NEW');
  });

  it('MEMBER e usuário sem vínculo não podem editar', async () => {
    const leadId = await createLead(orgA);
    expect((await fetch(`${base}/${orgA}/tourism/leads/${leadId}`, { method: 'PUT', headers: auth(memberToken), body: JSON.stringify({ stage: 'WON', expectedUpdatedAt: await version(leadId) }) })).status).toBe(403);
    expect((await fetch(`${base}/${orgA}/tourism/leads/${leadId}`, { method: 'PUT', headers: auth(strangerToken), body: JSON.stringify({ stage: 'WON', expectedUpdatedAt: await version(leadId) }) })).status).toBe(403);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).stage).toBe('NEW');
  });

  it('nunca aceita organizationId ou tripId arbitrários no corpo da atualização', async () => {
    const leadId = await createLead(orgA);
    const response = await fetch(`${base}/${orgA}/tourism/leads/${leadId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ organizationId: orgB, tripId: 'x' }) });
    expect(response.status).toBe(400);
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(row.organizationId).toBe(orgA);
    expect(row.tripId).toBeNull();
  });

  it('não permite remover o único contato restante (mescla com o valor atual antes de validar)', async () => {
    const leadId = await createLead(orgA);
    const response = await fetch(`${base}/${orgA}/tourism/leads/${leadId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ phone: null, email: '', expectedUpdatedAt: await version(leadId) }) });
    expect(response.status).toBe(400);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).phone).toBe(essentialBody.phone);
  });

  it('interessado inexistente responde 404', async () => {
    const response = await fetch(`${base}/${orgA}/tourism/leads/nao-existe`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ stage: 'WON', expectedUpdatedAt: new Date().toISOString() }) });
    expect(response.status).toBe(404);
  });

  it('rejeita versão antiga e preserva dados da atualização mais recente', async () => {
    const leadId = await createLead(orgA);
    const oldVersion = await version(leadId);
    const first = await fetch(`${base}/${orgA}/tourism/leads/${leadId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ phone: '111222333', notes: 'Nota atualizada', expectedUpdatedAt: oldVersion }) });
    expect(first.status).toBe(200);
    const updated = await first.json() as { updatedAt: string; notes: string };
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(oldVersion).getTime());
    expect(updated.notes).toBe('Nota atualizada');
    const stale = await fetch(`${base}/${orgA}/tourism/leads/${leadId}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ stage: 'CONTACTED', expectedUpdatedAt: oldVersion }) });
    expect(stale.status).toBe(409);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).phone).toBe('111222333');
    const current = await fetch(`${base}/${orgA}/tourism/leads/${leadId}`, { headers: auth(ownerToken) });
    expect((await current.json() as { notes: string }).notes).toBe('Nota atualizada');
  });
});
