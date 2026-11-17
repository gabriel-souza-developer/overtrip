import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server;
let base: string;

const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

// Usuários e empresas isolados por teste: o banco é compartilhado entre
// arquivos de teste (tests/setup/global-db.ts roda uma vez por execução), então
// nada aqui pode colidir com dados de outros arquivos.
let userA: { id: string; email: string; role: string; updatedAt: Date }; // membro ativo da orgActive
let userB: { id: string; email: string; role: string; updatedAt: Date }; // membro ativo da orgInactive e sem vínculo com orgActive
let userRevoked: { id: string; email: string; role: string; updatedAt: Date }; // vínculo revogado com orgActive
let tokenA: string;
let tokenB: string;
let tokenRevoked: string;
let orgActive: { id: string };
let orgInactive: { id: string };

beforeAll(async () => {
  userA = await prisma.user.create({ data: { email: 'org-test-user-a@example.test', passwordHash: 'test', role: 'admin' } });
  userB = await prisma.user.create({ data: { email: 'org-test-user-b@example.test', passwordHash: 'test', role: 'admin' } });
  userRevoked = await prisma.user.create({ data: { email: 'org-test-user-revoked@example.test', passwordHash: 'test', role: 'admin' } });

  orgActive = await prisma.organization.create({ data: { name: 'Agência Teste Ativa', slug: 'org-test-active' } });
  orgInactive = await prisma.organization.create({ data: { name: 'Agência Teste Inativa', slug: 'org-test-inactive', status: 'INACTIVE' } });

  await prisma.membership.create({ data: { organizationId: orgActive.id, userId: userA.id, role: 'OWNER', status: 'ACTIVE' } });
  await prisma.membership.create({ data: { organizationId: orgInactive.id, userId: userB.id, role: 'OWNER', status: 'ACTIVE' } });
  await prisma.membership.create({ data: { organizationId: orgActive.id, userId: userRevoked.id, role: 'MEMBER', status: 'REVOKED' } });

  tokenA = generateToken(userA);
  tokenB = generateToken(userB);
  tokenRevoked = generateToken(userRevoked);

  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.membership.deleteMany({ where: { organizationId: { in: [orgActive.id, orgInactive.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgActive.id, orgInactive.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id, userRevoked.id] } } });
  await prisma.$disconnect();
});

describe('Fundação de empresas (Organization/Membership)', () => {
  it('exige autenticação para listar e consultar empresas', async () => {
    const anonymous = await fetch(base);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('cache-control')).toContain('no-store');
    expect((await fetch(`${base}/${orgActive.id}`)).status).toBe(401);
  });

  it('lista apenas empresas ativas com vínculo ativo do próprio usuário (isolamento)', async () => {
    const resA = await fetch(base, { headers: headers(tokenA) });
    expect(resA.status).toBe(200);
    expect(resA.headers.get('cache-control')).toContain('no-store');
    const dataA = await resA.json() as { organizations: { id: string; role: string }[] };
    expect(dataA.organizations.map((o) => o.id)).toEqual([orgActive.id]);
    expect(dataA.organizations[0].role).toBe('OWNER');

    // userB só tem vínculo com a empresa inativa: não deve aparecer na listagem.
    const resB = await fetch(base, { headers: headers(tokenB) });
    expect(resB.status).toBe(200);
    const dataB = await resB.json() as { organizations: unknown[] };
    expect(dataB.organizations).toEqual([]);
  });

  it('permite consultar a empresa selecionada apenas para quem tem vínculo ativo nela', async () => {
    const res = await fetch(`${base}/${orgActive.id}`, { headers: headers(tokenA) });
    expect(res.status).toBe(200);
    const body = await res.json() as { organization: { id: string }; role: string };
    expect(body.organization.id).toBe(orgActive.id);
    expect(body.role).toBe('OWNER');
  });

  it('bloqueia acesso de um usuário sem vínculo com a empresa de outra agência', async () => {
    // userB nunca teve vínculo com orgActive: deve ser bloqueado, sem distinguir
    // "não existe" de "existe mas não pertence a você".
    const res = await fetch(`${base}/${orgActive.id}`, { headers: headers(tokenB) });
    expect(res.status).toBe(403);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('ORGANIZATION_ACCESS_DENIED');
  });

  it('bloqueia acesso a empresa inativa mesmo com vínculo ativo', async () => {
    const res = await fetch(`${base}/${orgInactive.id}`, { headers: headers(tokenB) });
    expect(res.status).toBe(403);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('ORGANIZATION_ACCESS_DENIED');

    // E a empresa inativa também não aparece na listagem do seu próprio membro.
    const list = await (await fetch(base, { headers: headers(tokenB) })).json() as { organizations: unknown[] };
    expect(list.organizations).toEqual([]);
  });

  it('bloqueia acesso para vínculo revogado, revalidando a cada requisição', async () => {
    const res = await fetch(`${base}/${orgActive.id}`, { headers: headers(tokenRevoked) });
    expect(res.status).toBe(403);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('ORGANIZATION_ACCESS_DENIED');

    const list = await (await fetch(base, { headers: headers(tokenRevoked) })).json() as { organizations: unknown[] };
    expect(list.organizations).toEqual([]);
  });

  it('revalida o vínculo a cada chamada: acesso cai imediatamente após revogação', async () => {
    const membership = await prisma.membership.create({
      data: { organizationId: orgActive.id, userId: userB.id, role: 'MEMBER', status: 'ACTIVE' },
    });

    const before = await fetch(`${base}/${orgActive.id}`, { headers: headers(tokenB) });
    expect(before.status).toBe(200);

    await prisma.membership.update({ where: { id: membership.id }, data: { status: 'REVOKED' } });

    const after = await fetch(`${base}/${orgActive.id}`, { headers: headers(tokenB) });
    expect(after.status).toBe(403);

    await prisma.membership.delete({ where: { id: membership.id } });
  });
});
