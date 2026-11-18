import { expect, test } from '@playwright/test';

// Primeira operação de escrita no painel de organizações (antes só consulta):
// cobre criar, editar, erro de validação e a restrição de MEMBER a somente
// leitura, tudo com a API simulada (mesma convenção de organization-access.spec.ts).

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };
const draftTrip = {
  id: 'trip-1', title: 'Trilha da Serra', category: 'Trilha', description: 'Descrição atual', city: 'Lucena', region: 'PB', updatedAt: '2029-01-01T00:00:00.000Z',
  startDateISO: '2030-06-01T09:00:00.000Z', endDateISO: null, status: 'DRAFT',
};

function mockOrganizationApi(page: import('@playwright/test').Page, { role, trips, onCreate, onUpdate }: {
  role: string; trips: typeof draftTrip[]; onCreate?: (body: unknown) => unknown; onUpdate?: (id: string, body: unknown) => unknown;
}) {
  let authenticated = false;
  return page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role }] } });
    if (url.pathname === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE' }, role } });
    if (url.pathname === '/api/organizations/a/tourism/trips') {
      if (request.method() === 'GET') return route.fulfill({ json: { data: trips, pagination: { page: 1, limit: 20, total: trips.length, totalPages: 1 } } });
      if (request.method() === 'POST') {
        if (!onCreate) return route.fulfill({ status: 403, json: { error: 'Papel insuficiente para esta operação', code: 'ORGANIZATION_ROLE_DENIED' } });
        const result = onCreate(request.postDataJSON());
        if (result && typeof result === 'object' && '__error' in result) return route.fulfill((result as { __error: { status: number; json: unknown } }).__error);
        return route.fulfill({ status: 201, json: result });
      }
    }
    if (url.pathname === '/api/organizations/a/tourism/trips/trip-1' && request.method() === 'PUT') {
      if (!onUpdate) return route.fulfill({ status: 403, json: { error: 'Papel insuficiente para esta operação', code: 'ORGANIZATION_ROLE_DENIED' } });
      const result = onUpdate('trip-1', request.postDataJSON());
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
  await page.getByRole('link', { name: 'Viagens', exact: true }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/trips$/);
}

test('OWNER cria uma viagem em rascunho pelo formulário', async ({ page }) => {
  let created: Record<string, unknown> | null = null;
  const trips: typeof draftTrip[] = [];
  await mockOrganizationApi(page, {
    role: 'OWNER', trips,
    onCreate: (body) => {
      created = body as Record<string, unknown>;
      trips.push({ ...draftTrip, title: (body as { title: string }).title });
      return { ...draftTrip, title: (body as { title: string }).title };
    },
  });
  await login(page);
  await expect(page.getByText('Nenhuma viagem cadastrada')).toBeVisible();

  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toBeVisible();
  await page.getByLabel('Título').fill('Trilha da Serra');
  await page.getByLabel('Categoria').fill('Trilha');
  await page.getByLabel('Cidade').fill('Lucena');
  await page.getByLabel('Estado').fill('PB');
  await page.getByLabel('Data de saída').fill('2030-06-01T09:00');
  await page.getByLabel('Descrição').fill('Caminhada guiada com paradas para observação.');
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toHaveCount(0);
  await expect(page.getByText('Trilha da Serra')).toBeVisible();
  // Nunca envia organizationId, status ou qualquer campo fora do essencial:
  // o formulário não oferece esses campos, então o corpo nunca os contém.
  expect(created).not.toBeNull();
  expect(created).not.toHaveProperty('organizationId');
  expect(created).not.toHaveProperty('status');
  expect(created).not.toHaveProperty('storedIdentity');
  expect((created as Record<string, unknown>).title).toBe('Trilha da Serra');
});

test('OWNER edita apenas campos alterados, preservando descrição e versão', async ({ page }) => {
  let updateBody: Record<string, unknown> | null = null;
  await mockOrganizationApi(page, {
    role: 'ADMIN', trips: [draftTrip],
    onUpdate: (_id, body) => { updateBody = body as Record<string, unknown>; return { ...draftTrip, title: (body as { title?: string }).title ?? draftTrip.title }; },
  });
  await login(page);
  await expect(page.getByText('Trilha da Serra')).toBeVisible();

  await page.getByRole('button', { name: /^Editar/ }).click();
  await expect(page.getByRole('heading', { name: 'Editar viagem' })).toBeVisible();
  await expect(page.getByLabel('Descrição')).toHaveValue('Descrição atual');
  await page.getByLabel('Título').fill('Trilha da Serra — Revisada');
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('heading', { name: 'Editar viagem' })).toHaveCount(0);
  expect(updateBody).not.toBeNull();
  expect((updateBody as Record<string, unknown>).title).toBe('Trilha da Serra — Revisada');
  expect(updateBody).not.toHaveProperty('description');
  expect(updateBody).not.toHaveProperty('city');
  expect(updateBody).not.toHaveProperty('endDateISO');
  expect((updateBody as Record<string, unknown>).expectedUpdatedAt).toBe(draftTrip.updatedAt);
});

test('conflito preserva rascunho digitado e mantém formulário aberto', async ({ page }) => {
  await mockOrganizationApi(page, {
    role: 'OWNER', trips: [draftTrip],
    onUpdate: () => ({ __error: { status: 409, json: { error: 'Esta viagem foi alterada por outra pessoa. Recarregue os dados antes de salvar.' } } }),
  });
  await login(page);
  await page.getByRole('button', { name: /^Editar/ }).click();
  await page.getByLabel('Título').fill('Alteração ainda não salva');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('alert')).toContainText('alterada por outra pessoa');
  await expect(page.getByLabel('Título')).toHaveValue('Alteração ainda não salva');
  await expect(page.getByRole('heading', { name: 'Editar viagem' })).toBeVisible();
});

test('erro de validação do servidor aparece no formulário e não fecha o modal', async ({ page }) => {
  await mockOrganizationApi(page, {
    role: 'OWNER', trips: [],
    onCreate: () => ({ __error: { status: 400, json: { error: 'Dados de entrada inválidos', code: 'VALIDATION_ERROR', details: [{ field: 'startDateISO', message: 'Data de início inválida' }] } } }),
  });
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await page.getByLabel('Título').fill('Trilha da Serra');
  await page.getByLabel('Categoria').fill('Trilha');
  await page.getByLabel('Cidade').fill('Lucena');
  await page.getByLabel('Estado').fill('PB');
  await page.getByLabel('Data de saída').fill('2030-06-01T09:00');
  await page.getByLabel('Descrição').fill('Descrição qualquer.');
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toBeVisible();
});

test('MEMBER só tem leitura: sem botão de criar e sem ação de editar', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'MEMBER', trips: [draftTrip] });
  await login(page);
  await expect(page.getByText('Trilha da Serra')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nova viagem' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Editar/ })).toHaveCount(0);
});
