import { expect, test, type Page } from '@playwright/test';

async function authenticate(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'token');
    localStorage.setItem('auth_user', JSON.stringify({ id: '1', email: 'admin@example.test', name: 'Admin', role: 'admin' }));
  });
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: '1', email: 'admin@example.test', name: 'Admin', role: 'admin' } }));
}

const trip = { id: 'trip1', title: 'Lucena' };
const pagination = { page: 1, totalPages: 1, total: 1, limit: 100 };

test('filtros e paginação atualizam reservas sem buscar novamente os catálogos', async ({ page }) => {
  await authenticate(page);
  let tripRequests = 0;
  let leadRequests = 0;
  await page.route('**/api/trips?*', route => { tripRequests++; return route.fulfill({ json: { data: [trip], pagination } }); });
  await page.route('**/api/leads?*', route => { leadRequests++; return route.fulfill({ json: { data: [], pagination: { ...pagination, total: 0 } } }); });
  await page.route('**/api/reservations?*', route => {
    const url = new URL(route.request().url());
    const currentPage = Number(url.searchParams.get('page'));
    const status = url.searchParams.get('status') || 'todas';
    return route.fulfill({ json: {
      data: [{ id: `res-${currentPage}`, tripId: 'trip1', leadId: null, customerName: `Reserva ${status} página ${currentPage}`, customerPhone: null, seats: 1, totalCents: 10000, notes: null, status: 'PENDING', trip, installments: [] }],
      pagination: { page: currentPage, limit: 20, total: 40, totalPages: 2 },
    } });
  });
  await page.goto('/reservations');
  await expect(page.getByText('Reserva todas página 1')).toBeVisible();
  await expect(page.locator('#res-filter-trip option[value="trip1"]')).toBeAttached();
  expect(leadRequests).toBe(0);
  const initialTrips = tripRequests;
  const initialLeads = leadRequests;
  await page.getByLabel('Situação', { exact: true }).first().selectOption('CONFIRMED');
  await expect(page.getByText('Reserva CONFIRMED página 1')).toBeVisible();
  await page.getByRole('button', { name: 'Próxima página' }).click();
  await expect(page.getByText('Reserva CONFIRMED página 2')).toBeVisible();
  expect(tripRequests).toBe(initialTrips);
  expect(leadRequests).toBe(initialLeads);
});

test('falha no catálogo não impede a visualização das reservas', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/trips?*', route => route.fulfill({ json: { data: [trip], pagination } }));
  await page.route('**/api/leads?*', route => route.fulfill({ status: 500, json: { error: 'Indisponível' } }));
  await page.route('**/api/reservations?*', route => route.fulfill({ json: {
    data: [{ id: 'res1', tripId: 'trip1', leadId: null, customerName: 'Reserva disponível', customerPhone: null, seats: 1, totalCents: 10000, notes: null, status: 'PENDING', trip, installments: [] }],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  } }));
  await page.goto('/reservations');
  await expect(page.getByText('Reserva disponível')).toBeVisible();
  await expect(page.locator('#res-filter-trip option[value="trip1"]')).toBeAttached();
  await page.getByRole('button', { name: 'Nova reserva' }).click();
  await page.locator('#res-trip').selectOption('trip1');
  await expect(page.getByRole('button', { name: 'Tentar novamente interessados' })).toBeVisible();
  await expect(page.getByText('Reserva disponível')).toBeVisible();
});

test('busca por página preserva o interessado vinculado ao editar', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/trips?*', route => route.fulfill({ json: { data: [trip], pagination } }));
  await page.route('**/api/leads?*', route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('eligibleTripId')).toBe('trip1');
    return route.fulfill({ json: { data: [], pagination: { page: 1, totalPages: 0, total: 0 } } });
  });
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/reservations**', route => {
    if (route.request().method() === 'PATCH') { submitted = route.request().postDataJSON(); return route.fulfill({ json: {} }); }
    return route.fulfill({ json: { data: [{ id: 'res1', tripId: 'trip1', leadId: 'lead1', lead: { id: 'lead1', name: 'Ana' }, customerName: 'Ana', customerPhone: null, seats: 1, totalCents: 10000, notes: null, status: 'PENDING', trip, installments: [] }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
  });
  await page.goto('/reservations');
  await page.getByRole('button', { name: 'Editar dados' }).click();
  await expect(page.locator('#res-lead')).toHaveValue('lead1');
  await page.getByLabel('Buscar interessado').fill('outro nome');
  await page.getByLabel('Buscar interessado').press('Enter');
  expect(submitted).toBeUndefined();
  await expect(page.locator('#res-lead')).toHaveValue('lead1');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect.poll(() => submitted?.leadId).toBe('lead1');
});

test('busca viagens e interessados em páginas limitadas', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/trips?*', route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('limit')).toBe('20');
    const pageNumber = url.searchParams.get('page');
    return route.fulfill({ json: { data: [{ id: `trip${pageNumber}`, title: `Viagem ${pageNumber}` }], pagination: { page: Number(pageNumber), limit: 20, total: 2, totalPages: 2 } } });
  });
  await page.route('**/api/leads?*', route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('limit')).toBe('20');
    const pageNumber = url.searchParams.get('page');
    return route.fulfill({ json: { data: [{ id: `lead${pageNumber}`, name: `Pessoa ${pageNumber}`, tripId: 'trip2' }], pagination: { page: Number(pageNumber), total: 2, totalPages: 2 } } });
  });
  await page.route('**/api/reservations?*', route => route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } }));
  await page.goto('/reservations');
  await page.getByRole('button', { name: 'Carregar mais viagens' }).click();
  await expect(page.locator('#res-filter-trip option[value="trip2"]')).toBeAttached();
  await page.getByRole('button', { name: 'Nova reserva' }).click();
  await page.locator('#res-trip').selectOption('trip2');
  await page.getByRole('button', { name: 'Carregar mais interessados' }).click();
  await expect(page.locator('#res-lead option[value="lead2"]')).toBeAttached();
});
