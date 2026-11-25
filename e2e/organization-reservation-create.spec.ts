import { expect, test } from '@playwright/test';

// Primeira operação de escrita de reservas administrativas no painel de
// organizações: cobre criar, editar, conflito de versão (409) e a restrição
// de MEMBER a acesso nenhum, tudo com a API simulada (mesma convenção de
// organization-lead-create.spec.ts).

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };
const tripA = { id: 'trip-1', title: 'Trilha de Lucena', category: 'Trilha', city: 'Lucena', region: 'PB', startDateISO: '2030-06-01T09:00:00.000Z', endDateISO: null, status: 'OPEN' };
const reservationA = {
  id: 'res-1', tripId: 'trip-1', customerName: 'Cliente Original', customerPhone: '83999990000', seats: 2,
  status: 'PENDING', totalCents: 50000, notes: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  trip: { id: 'trip-1', title: tripA.title, startDateISO: tripA.startDateISO },
  installments: [], leadId: null,
};

function mockOrganizationApi(page: import('@playwright/test').Page, { role, reservations, onCreate, onUpdate }: {
  role: string; reservations: typeof reservationA[]; onCreate?: (body: unknown) => unknown; onUpdate?: (id: string, body: unknown) => unknown;
}) {
  let authenticated = false;
  return page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role }] } });
    if (url.pathname === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE' }, role } });
    if (url.pathname === '/api/organizations/a/tourism/trips') return route.fulfill({ json: { data: [tripA], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } } });
    if (url.pathname === '/api/organizations/a/tourism/leads') return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } } });
    if (url.pathname === '/api/organizations/a/tourism/reservations') {
      if (role !== 'OWNER' && role !== 'ADMIN') return route.fulfill({ status: 403, json: { error: 'Papel insuficiente para esta operação', code: 'ORGANIZATION_ROLE_DENIED' } });
      if (request.method() === 'GET') return route.fulfill({ json: { data: reservations, pagination: { page: 1, limit: 20, total: reservations.length, totalPages: 1 } } });
      if (request.method() === 'POST') {
        if (!onCreate) return route.fulfill({ status: 403, json: { error: 'Papel insuficiente para esta operação', code: 'ORGANIZATION_ROLE_DENIED' } });
        const result = onCreate(request.postDataJSON());
        if (result && typeof result === 'object' && '__error' in result) return route.fulfill((result as { __error: { status: number; json: unknown } }).__error);
        return route.fulfill({ status: 201, json: result });
      }
    }
    if (url.pathname === '/api/organizations/a/tourism/reservations/res-1' && request.method() === 'PUT') {
      if (!onUpdate) return route.fulfill({ status: 403, json: { error: 'Papel insuficiente para esta operação', code: 'ORGANIZATION_ROLE_DENIED' } });
      const result = onUpdate('res-1', request.postDataJSON());
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
  await page.getByRole('link', { name: 'Reservas', exact: true }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/reservations$/);
}

test('OWNER cadastra uma reserva pelo formulário (status inicial sempre pendente)', async ({ page }) => {
  let created: Record<string, unknown> | null = null;
  const reservations: typeof reservationA[] = [];
  await mockOrganizationApi(page, {
    role: 'OWNER', reservations,
    onCreate: (body) => {
      created = body as Record<string, unknown>;
      const reservation = { ...reservationA, customerName: (body as { customerName: string }).customerName };
      reservations.push(reservation);
      return reservation;
    },
  });
  await login(page);
  await expect(page.getByText('Nenhuma reserva encontrada')).toBeVisible();

  await page.getByRole('button', { name: 'Nova reserva' }).first().click();
  await expect(page.getByRole('heading', { name: 'Nova reserva' })).toBeVisible();
  await page.getByLabel('Viagem').selectOption('trip-1');
  await page.getByLabel('Cliente').fill('Cliente Novo');
  await page.getByLabel('Telefone').fill('83999990000');
  await page.getByLabel('Lugares').fill('3');
  await page.getByLabel('Valor total (R$)').fill('500,00');
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('heading', { name: 'Nova reserva' })).toHaveCount(0);
  await expect(page.getByText('Cliente Novo')).toBeVisible();
  // Nunca envia organizationId ou status (sempre inicia pendente no servidor).
  expect(created).not.toBeNull();
  expect(created).not.toHaveProperty('organizationId');
  expect(created).not.toHaveProperty('status');
  expect((created as Record<string, unknown>).tripId).toBe('trip-1');
  expect((created as Record<string, unknown>).totalCents).toBe(50000);
});

test('OWNER edita e envia somente campos alterados com a versão atual', async ({ page }) => {
  let updateBody: Record<string, unknown> | null = null;
  await mockOrganizationApi(page, {
    role: 'ADMIN', reservations: [reservationA],
    onUpdate: (_id, body) => { updateBody = body as Record<string, unknown>; return { ...reservationA, status: (body as { status?: string }).status ?? reservationA.status }; },
  });
  await login(page);
  await expect(page.getByText('Cliente Original')).toBeVisible();

  await page.getByRole('button', { name: /^Editar/ }).click();
  await expect(page.getByRole('heading', { name: 'Editar reserva' })).toBeVisible();
  await page.getByLabel('Status').selectOption('CONFIRMED');
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('heading', { name: 'Editar reserva' })).toHaveCount(0);
  expect(updateBody).not.toBeNull();
  expect((updateBody as Record<string, unknown>).status).toBe('CONFIRMED');
  expect(updateBody).toHaveProperty('expectedUpdatedAt', reservationA.updatedAt);
  expect(updateBody).not.toHaveProperty('customerName');
  expect(updateBody).not.toHaveProperty('tripId');
});

test('valor vazio ou impreciso não cria nem altera reserva; zero explícito é aceito', async ({ page }) => {
  let writes = 0;
  await mockOrganizationApi(page, {
    role: 'OWNER', reservations: [reservationA],
    onCreate: body => { writes++; return { ...reservationA, ...(body as object) }; },
    onUpdate: (_id, body) => { writes++; return { ...reservationA, ...(body as object) }; },
  });
  await login(page);
  await page.getByRole('button', { name: 'Nova reserva' }).first().click();
  await page.getByLabel('Viagem').selectOption('trip-1');
  await page.locator('#org-reservation-name').fill('Teste');
  for (const value of ['', '   ', '1e3', '1,234', '1.000,00']) {
    await page.getByLabel('Valor total (R$)').fill(value);
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('alert')).toContainText('valor total válido');
    expect(writes).toBe(0);
  }
  await page.getByLabel('Valor total (R$)').fill('0');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Nova reserva' })).toHaveCount(0);
  expect(writes).toBe(1);

  await page.getByRole('button', { name: /^Editar/ }).first().click();
  await page.getByLabel('Valor total (R$)').fill('');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('alert')).toContainText('valor total válido');
  expect(writes).toBe(1);
});

test('informa erro de viagens e permite carregar páginas adicionais de opções', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER', reservations: [] });
  let failReservationTrips = true;
  await page.route(url => url.pathname === '/api/organizations/a/tourism/trips', route => {
    if (page.url().endsWith('/reservations') && failReservationTrips) {
      return route.fulfill({ status: 500, json: { error: 'Falha' } });
    }
    const pageNumber = Number(new URL(route.request().url()).searchParams.get('page') || 1);
    return route.fulfill({ json: { data: [pageNumber === 1 ? tripA : { ...tripA, id: 'trip-2', title: 'Viagem adicional' }], pagination: { page: pageNumber, limit: 100, total: 101, totalPages: 2 } } });
  });
  await page.route(url => url.pathname === '/api/organizations/a/tourism/leads', route => {
    const pageNumber = Number(new URL(route.request().url()).searchParams.get('page') || 1);
    return route.fulfill({ json: { data: [{ id: `lead-${pageNumber}`, name: `Interessado ${pageNumber}`, tripId: null }], pagination: { page: pageNumber, limit: 100, total: 101, totalPages: 2 } } });
  });
  await login(page);
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar as viagens');
  failReservationTrips = false;
  await page.getByRole('button', { name: 'Tentar novamente viagens' }).click();
  await page.getByRole('button', { name: 'Nova reserva' }).first().click();
  await page.getByRole('button', { name: 'Carregar mais viagens' }).click();
  await expect(page.getByLabel('Viagem').locator('option[value="trip-2"]')).toHaveText('Viagem adicional');
  await page.getByRole('button', { name: 'Carregar mais interessados' }).click();
  await expect(page.getByLabel('Interessado vinculado').locator('option[value="lead-2"]')).toHaveText('Interessado 2');
});

test('conflito de versão mantém edição aberta e informa que é preciso recarregar', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER', reservations: [reservationA], onUpdate: () => ({ __error: { status: 409, json: { error: 'Esta reserva foi alterada por outra pessoa. Recarregue os dados antes de salvar.' } } }) });
  await login(page);
  await page.getByRole('button', { name: /^Editar/ }).click();
  await page.getByLabel('Status').selectOption('CANCELLED');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('alert')).toContainText('Recarregue');
  await expect(page.getByRole('heading', { name: 'Editar reserva' })).toBeVisible();
  await expect(page.getByLabel('Status')).toHaveValue('CANCELLED');
});

test('MEMBER não tem acesso a reservas: o menu nem mostra o link, e a rota direta mostra acesso restrito, sem botões', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'MEMBER', reservations: [reservationA] });
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  // MEMBER não vê o item "Reservas" no menu da empresa.
  await expect(page.getByRole('link', { name: 'Reservas', exact: true })).toHaveCount(0);

  await page.goto('/empresa/a/reservations');
  await expect(page.getByText('Acesso restrito')).toBeVisible();
  await expect(page.getByText('Cliente Original')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nova reserva' })).toHaveCount(0);
});
