import { expect, test } from '@playwright/test';

// Primeira operação de escrita de interessados (CRM) no painel de
// organizações: cobre criar, editar, erro de validação e a restrição de
// MEMBER a acesso nenhum, tudo com a API simulada (mesma convenção de
// organization-access.spec.ts e organization-trip-create.spec.ts).

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };
const leadA = { id: 'lead-1', name: 'Maria Interessada', phone: '83999990000', email: 'maria@example.test', stage: 'NEW', notes: 'Preferência original', responsible: null, nextFollowUpAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', tripId: null };

function mockOrganizationApi(page: import('@playwright/test').Page, { role, leads, onCreate, onUpdate }: {
  role: string; leads: typeof leadA[]; onCreate?: (body: unknown) => unknown; onUpdate?: (id: string, body: unknown) => unknown;
}) {
  let authenticated = false;
  return page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role }] } });
    if (url.pathname === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE' }, role } });
    if (url.pathname === '/api/organizations/a/tourism/leads') {
      if (role !== 'OWNER' && role !== 'ADMIN') return route.fulfill({ status: 403, json: { error: 'Papel insuficiente para esta operação', code: 'ORGANIZATION_ROLE_DENIED' } });
      if (request.method() === 'GET') return route.fulfill({ json: { data: leads, pagination: { page: 1, limit: 20, total: leads.length, totalPages: 1 } } });
      if (request.method() === 'POST') {
        if (!onCreate) return route.fulfill({ status: 403, json: { error: 'Papel insuficiente para esta operação', code: 'ORGANIZATION_ROLE_DENIED' } });
        const result = onCreate(request.postDataJSON());
        if (result && typeof result === 'object' && '__error' in result) return route.fulfill((result as { __error: { status: number; json: unknown } }).__error);
        return route.fulfill({ status: 201, json: result });
      }
    }
    if (url.pathname === '/api/organizations/a/tourism/leads/lead-1' && request.method() === 'PUT') {
      if (!onUpdate) return route.fulfill({ status: 403, json: { error: 'Papel insuficiente para esta operação', code: 'ORGANIZATION_ROLE_DENIED' } });
      const result = onUpdate('lead-1', request.postDataJSON());
      if (result && typeof result === 'object' && '__error' in result) return route.fulfill((result as { __error: { status: number; json: unknown } }).__error);
      return route.fulfill({ json: result });
    }
    if (url.pathname === '/api/organizations/a/tourism/dashboard') return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  // A aba Interessados está oculta do menu; a rota continua acessível.
  await page.goto('/empresa/a/leads');
  await expect(page).toHaveURL(/\/empresa\/a\/leads$/);
}

test('OWNER cadastra um interessado pelo formulário', async ({ page }) => {
  let created: Record<string, unknown> | null = null;
  const leads: typeof leadA[] = [];
  await mockOrganizationApi(page, {
    role: 'OWNER', leads,
    onCreate: (body) => {
      created = body as Record<string, unknown>;
      const lead = { ...leadA, name: (body as { name: string }).name };
      leads.push(lead);
      return lead;
    },
  });
  await login(page);
  await expect(page.getByText('Nenhum interessado encontrado')).toBeVisible();

  await page.getByRole('button', { name: 'Novo interessado' }).first().click();
  await expect(page.getByRole('heading', { name: 'Novo interessado' })).toBeVisible();
  await page.getByLabel('Nome').fill('Maria Interessada');
  await page.getByLabel('Telefone').fill('83999990000');
  await page.getByLabel('Responsável').fill('Ana');
  await page.getByRole('dialog', { name: 'Novo interessado' }).getByLabel('Próximo contato').fill('2030-06-01');
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('heading', { name: 'Novo interessado' })).toHaveCount(0);
  await expect(page.getByText('Maria Interessada')).toBeVisible();
  // Nunca envia organizationId, tripId ou qualquer campo fora do essencial.
  expect(created).not.toBeNull();
  expect(created).not.toHaveProperty('organizationId');
  expect(created).not.toHaveProperty('tripId');
  expect((created as Record<string, unknown>).name).toBe('Maria Interessada');
  expect((created as Record<string, unknown>).responsible).toBe('Ana');
  expect((created as Record<string, unknown>).nextFollowUpAt).toBe('2030-06-01T12:00:00.000Z');
});

test('filtros solicitam somente a etapa e contatos vencidos ou de hoje', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER', leads: [] });
  await login(page);
  await page.getByLabel('Etapa', { exact: true }).selectOption('CONTACTED');
  const filtered = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname.endsWith('/tourism/leads') && url.searchParams.get('stage') === 'CONTACTED' && url.searchParams.get('followUp') === 'due';
  });
  await page.getByLabel('Próximo contato', { exact: true }).selectOption('due');
  await filtered;
});

test('OWNER vê as anotações e envia somente campos alterados com versão', async ({ page }) => {
  let updateBody: Record<string, unknown> | null = null;
  await mockOrganizationApi(page, {
    role: 'ADMIN', leads: [leadA],
    onUpdate: (_id, body) => { updateBody = body as Record<string, unknown>; return { ...leadA, stage: (body as { stage?: string }).stage ?? leadA.stage }; },
  });
  await login(page);
  await expect(page.getByText('Maria Interessada')).toBeVisible();

  await page.getByRole('button', { name: /^Editar/ }).click();
  await expect(page.getByRole('heading', { name: 'Editar interessado' })).toBeVisible();
  await expect(page.getByLabel('Anotações')).toHaveValue('Preferência original');
  await page.getByRole('dialog', { name: 'Editar interessado' }).getByLabel('Etapa').selectOption('CONTACTED');
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('heading', { name: 'Editar interessado' })).toHaveCount(0);
  expect(updateBody).not.toBeNull();
  expect((updateBody as Record<string, unknown>).stage).toBe('CONTACTED');
  expect(updateBody).toHaveProperty('expectedUpdatedAt', leadA.updatedAt);
  expect(updateBody).not.toHaveProperty('notes');
  expect(updateBody).not.toHaveProperty('phone');
  expect(updateBody).not.toHaveProperty('email');
});

test('conflito de versão mantém edição aberta e informa que é preciso recarregar', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER', leads: [leadA], onUpdate: () => ({ __error: { status: 409, json: { error: 'Este interessado foi alterado por outra pessoa. Recarregue os dados antes de salvar.' } } }) });
  await login(page);
  await page.getByRole('button', { name: /^Editar/ }).click();
  await page.getByRole('dialog', { name: 'Editar interessado' }).getByLabel('Etapa').selectOption('WON');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('alert')).toContainText('Recarregue');
  await expect(page.getByRole('dialog', { name: 'Editar interessado' }).getByLabel('Etapa')).toHaveValue('WON');
});

test('erro de validação do servidor aparece no formulário e não fecha o modal', async ({ page }) => {
  await mockOrganizationApi(page, {
    role: 'OWNER', leads: [],
    onCreate: () => ({ __error: { status: 400, json: { error: 'Dados de entrada inválidos', code: 'VALIDATION_ERROR', details: [{ field: 'name', message: 'Nome é obrigatório' }] } } }),
  });
  await login(page);
  await page.getByRole('button', { name: 'Novo interessado' }).first().click();
  await page.getByLabel('Nome').fill('Maria Interessada');
  await page.getByLabel('Telefone').fill('83999990000');
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Novo interessado' })).toBeVisible();
});

test('MEMBER não tem acesso a interessados: o menu nem mostra o link, e a rota direta mostra acesso restrito, sem botões', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'MEMBER', leads: [leadA] });
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  // MEMBER não vê o item "Interessados" no menu da empresa.
  await expect(page.getByRole('link', { name: 'Interessados', exact: true })).toHaveCount(0);

  await page.goto('/empresa/a/leads');
  await expect(page.getByText('Acesso restrito')).toBeVisible();
  await expect(page.getByText('Maria Interessada')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Novo interessado' })).toHaveCount(0);
});
