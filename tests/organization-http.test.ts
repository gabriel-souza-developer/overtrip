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
let orgOther: { id: string }; // só para os testes de configurações: isolamento cruzado
let memberToken: string;
let tokenOther: string;

beforeAll(async () => {
  userA = await prisma.user.create({ data: { email: 'org-test-user-a@example.test', passwordHash: 'test', role: 'admin' } });
  userB = await prisma.user.create({ data: { email: 'org-test-user-b@example.test', passwordHash: 'test', role: 'admin' } });
  userRevoked = await prisma.user.create({ data: { email: 'org-test-user-revoked@example.test', passwordHash: 'test', role: 'admin' } });

  orgActive = await prisma.organization.create({ data: { name: 'Agência Teste Ativa', slug: 'org-test-active' } });
  orgInactive = await prisma.organization.create({ data: { name: 'Agência Teste Inativa', slug: 'org-test-inactive', status: 'INACTIVE' } });
  orgOther = await prisma.organization.create({ data: { name: 'Agência Teste Config B', slug: 'org-test-settings-b' } });

  await prisma.membership.create({ data: { organizationId: orgActive.id, userId: userA.id, role: 'OWNER', status: 'ACTIVE' } });
  await prisma.membership.create({ data: { organizationId: orgInactive.id, userId: userB.id, role: 'OWNER', status: 'ACTIVE' } });
  await prisma.membership.create({ data: { organizationId: orgActive.id, userId: userRevoked.id, role: 'MEMBER', status: 'REVOKED' } });

  tokenA = generateToken(userA);
  tokenB = generateToken(userB);
  tokenRevoked = generateToken(userRevoked);
  const memberUser = await prisma.user.create({ data: { email: 'org-test-settings-member@example.test', passwordHash: 'test', role: 'admin' } });
  await prisma.membership.create({ data: { organizationId: orgActive.id, userId: memberUser.id, role: 'MEMBER', status: 'ACTIVE' } });
  memberToken = generateToken(memberUser);
  // Dedicado para não afetar as suposições dos testes de isolamento acima
  // (userB só tem vínculo com a empresa inativa).
  const otherUser = await prisma.user.create({ data: { email: 'org-test-settings-other@example.test', passwordHash: 'test', role: 'admin' } });
  await prisma.membership.create({ data: { organizationId: orgOther.id, userId: otherUser.id, role: 'OWNER', status: 'ACTIVE' } });
  tokenOther = generateToken(otherUser);

  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.membership.deleteMany({ where: { organizationId: { in: [orgActive.id, orgInactive.id, orgOther.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgActive.id, orgInactive.id, orgOther.id] } } });
  await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email, userRevoked.email, 'org-test-settings-member@example.test', 'org-test-settings-other@example.test'] } } });
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

describe('PUT /:organizationId/settings (unidade de preço padrão)', () => {
  it('OWNER edita, a leitura seguinte reflete, e o valor anterior some sem deixar rastro em outro campo', async () => {
    const updated = await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'por grupo' }) });
    expect(updated.status).toBe(200);
    const body = await updated.json() as { organization: { defaultPriceUnit: string | null; name: string; id: string } };
    expect(body.organization.defaultPriceUnit).toBe('por grupo');
    expect(body.organization.id).toBe(orgActive.id);

    const read = await fetch(`${base}/${orgActive.id}`, { headers: headers(tokenA) });
    const readBody = await read.json() as { organization: { defaultPriceUnit: string | null } };
    expect(readBody.organization.defaultPriceUnit).toBe('por grupo');
  });

  it('aceita null para limpar a substituição; o campo volta a null na leitura (o padrão fixo é só do front-end)', async () => {
    const cleared = await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: null }) });
    expect(cleared.status).toBe(200);
    const body = await cleared.json() as { organization: { defaultPriceUnit: string | null } };
    expect(body.organization.defaultPriceUnit).toBeNull();

    const read = await fetch(`${base}/${orgActive.id}`, { headers: headers(tokenA) });
    expect((await read.json() as { organization: { defaultPriceUnit: string | null } }).organization.defaultPriceUnit).toBeNull();

    // Restaura 'por grupo' para não afetar os testes seguintes deste arquivo.
    await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'por grupo' }) });
  });

  it('rejeita string vazia, texto maior que 40 caracteres e campo desconhecido', async () => {
    expect((await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: '' }) })).status).toBe(400);
    expect((await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'x'.repeat(41) }) })).status).toBe(400);
    expect((await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'por pessoa', other: 'x' }) })).status).toBe(400);
  });

  it('exige sessão e papel OWNER/ADMIN: 401 sem token, 403 para MEMBER', async () => {
    expect((await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ defaultPriceUnit: 'por pessoa' }) })).status).toBe(401);
    const asMember = await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(memberToken), body: JSON.stringify({ defaultPriceUnit: 'por pessoa' }) });
    expect(asMember.status).toBe(403);
  });

  it('isolamento nas duas direções: userB não altera nem lê o padrão de orgActive, e userA não altera o de orgOther', async () => {
    // Direção 1: quem não tem vínculo com orgActive não consegue mudar o padrão dela.
    const cross = await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenB), body: JSON.stringify({ defaultPriceUnit: 'sequestrado' }) });
    expect(cross.status).toBe(403);
    const stillA = await fetch(`${base}/${orgActive.id}`, { headers: headers(tokenA) });
    expect((await stillA.json() as { organization: { defaultPriceUnit: string | null } }).organization.defaultPriceUnit).toBe('por grupo');

    // Direção 2: userA (OWNER só de orgActive) não altera o padrão de orgOther.
    const otherDefault = await fetch(`${base}/${orgOther.id}/settings`, { method: 'PUT', headers: headers(tokenOther), body: JSON.stringify({ defaultPriceUnit: 'por diária' }) });
    expect(otherDefault.status).toBe(200);
    const crossOther = await fetch(`${base}/${orgOther.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'sequestrado' }) });
    expect(crossOther.status).toBe(403);
    const stillOther = await fetch(`${base}/${orgOther.id}`, { headers: headers(tokenOther) });
    expect((await stillOther.json() as { organization: { defaultPriceUnit: string | null } }).organization.defaultPriceUnit).toBe('por diária');
  });

  it('empresa inativa recusa a escrita mesmo para quem tem vínculo OWNER ativo nela', async () => {
    const res = await fetch(`${base}/${orgInactive.id}/settings`, { method: 'PUT', headers: headers(tokenB), body: JSON.stringify({ defaultPriceUnit: 'por pessoa' }) });
    expect(res.status).toBe(403);
  });
});

describe('PUT /:organizationId/settings (cor da empresa)', () => {
  it('OWNER define uma cor válida; a leitura seguinte reflete, normalizada em minúsculas', async () => {
    const updated = await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'por grupo', brandColor: '#0B756B' }) });
    expect(updated.status).toBe(200);
    const body = await updated.json() as { organization: { brandColor: string | null } };
    expect(body.organization.brandColor).toBe('#0b756b');

    const read = await fetch(`${base}/${orgActive.id}`, { headers: headers(tokenA) });
    expect((await read.json() as { organization: { brandColor: string | null } }).organization.brandColor).toBe('#0b756b');
  });

  it('brandColor omitido não altera a cor já salva; null limpa e volta ao padrão verde (que é só do front-end)', async () => {
    const omitted = await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'por grupo' }) });
    expect((await omitted.json() as { organization: { brandColor: string | null } }).organization.brandColor).toBe('#0b756b');

    const cleared = await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'por grupo', brandColor: null }) });
    expect((await cleared.json() as { organization: { brandColor: string | null } }).organization.brandColor).toBeNull();
  });

  it('rejeita formato inválido e cor clara demais para o contraste mínimo, sem gravar nada', async () => {
    expect((await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'por grupo', brandColor: 'azul' }) })).status).toBe(400);
    expect((await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'por grupo', brandColor: '#12345' }) })).status).toBe(400);
    expect((await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'por grupo', brandColor: '<script>' }) })).status).toBe(400);
    // Amarelo claro: formato válido, mas contraste insuficiente contra branco.
    expect((await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'por grupo', brandColor: '#ffff00' }) })).status).toBe(400);

    const stillCleared = await fetch(`${base}/${orgActive.id}`, { headers: headers(tokenA) });
    expect((await stillCleared.json() as { organization: { brandColor: string | null } }).organization.brandColor).toBeNull(); // da limpeza do teste anterior; nenhuma tentativa rejeitada gravou nada
  });

  it('exige sessão e papel OWNER/ADMIN: 401 sem token, 403 para MEMBER', async () => {
    expect((await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ defaultPriceUnit: 'por grupo', brandColor: '#123456' }) })).status).toBe(401);
    const asMember = await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(memberToken), body: JSON.stringify({ defaultPriceUnit: 'por grupo', brandColor: '#123456' }) });
    expect(asMember.status).toBe(403);
  });

  it('isolamento cruzado: cor definida numa empresa não aparece nem pode ser mudada a partir de outra', async () => {
    const setOnOther = await fetch(`${base}/${orgOther.id}/settings`, { method: 'PUT', headers: headers(tokenOther), body: JSON.stringify({ defaultPriceUnit: 'por diária', brandColor: '#5a319b' }) });
    expect(setOnOther.status).toBe(200);

    const crossAttempt = await fetch(`${base}/${orgOther.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'sequestrado', brandColor: '#000000' }) });
    expect(crossAttempt.status).toBe(403);

    const stillOther = await fetch(`${base}/${orgOther.id}`, { headers: headers(tokenOther) });
    expect((await stillOther.json() as { organization: { brandColor: string | null } }).organization.brandColor).toBe('#5a319b');

    // orgActive nunca recebeu essa cor: campos de uma empresa não vazam para outra.
    const stillActive = await fetch(`${base}/${orgActive.id}`, { headers: headers(tokenA) });
    expect((await stillActive.json() as { organization: { brandColor: string | null } }).organization.brandColor).toBeNull();
  });

  it('defaultPriceUnit agora é opcional no corpo: brandColor pode ser gravado isoladamente sem reenviar (e sem sobrescrever) o padrão de preço', async () => {
    // Estado conhecido: "por grupo" gravado antes deste teste.
    const baseline = await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'por grupo' }) });
    expect(baseline.status).toBe(200);

    // Simula uma escrita concorrente de outro administrador: muda só o
    // padrão de preço, igual a uma segunda aba aberta ao mesmo tempo.
    const concurrent = await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'por diária (admin concorrente)' }) });
    expect(concurrent.status).toBe(200);

    // Corpo com só brandColor (sem a chave defaultPriceUnit, não apenas
    // null): é exatamente o que o formulário de cor do painel envia hoje.
    const brandOnly = await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ brandColor: '#123456' }) });
    expect(brandOnly.status).toBe(200);
    const brandOnlyBody = await brandOnly.json() as { organization: { defaultPriceUnit: string | null; brandColor: string | null } };
    expect(brandOnlyBody.organization.brandColor).toBe('#123456');
    // A escrita concorrente sobrevive: gravar só a cor não reverteu o
    // padrão de preço para um retrato antigo capturado antes dela.
    expect(brandOnlyBody.organization.defaultPriceUnit).toBe('por diária (admin concorrente)');

    // Simétrico: corpo com só defaultPriceUnit não toca a cor já salva.
    const priceOnly = await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'por pessoa' }) });
    expect(priceOnly.status).toBe(200);
    const priceOnlyBody = await priceOnly.json() as { organization: { defaultPriceUnit: string | null; brandColor: string | null } };
    expect(priceOnlyBody.organization.defaultPriceUnit).toBe('por pessoa');
    expect(priceOnlyBody.organization.brandColor).toBe('#123456');

    // Corpo vazio: nenhum dos dois campos presente, nenhum dos dois muda.
    const empty = await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({}) });
    expect(empty.status).toBe(200);
    const emptyBody = await empty.json() as { organization: { defaultPriceUnit: string | null; brandColor: string | null } };
    expect(emptyBody.organization.defaultPriceUnit).toBe('por pessoa');
    expect(emptyBody.organization.brandColor).toBe('#123456');

    // Restaura o estado usado pelos demais testes deste arquivo.
    await fetch(`${base}/${orgActive.id}/settings`, { method: 'PUT', headers: headers(tokenA), body: JSON.stringify({ defaultPriceUnit: 'por grupo', brandColor: null }) });
  });
});
