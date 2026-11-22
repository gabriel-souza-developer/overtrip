import { expect, test } from '@playwright/test';

// Cobre a paridade de presets do formulário de viagens da empresa com o
// formulário legado (TripForm.tsx): presets de "o que inclui" e de
// "informações importantes" (checkboxes reaproveitando includesServices.ts
// e tripFormOptions.ts), a categoria do site como lista pronta
// (FILTER_CATEGORY_OPTIONS) e a mesma proteção contra perda de texto ainda
// não confirmado em qualquer lista ao salvar.

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };

function mockOrganizationApi(page: import('@playwright/test').Page, onCreate: (body: unknown) => unknown) {
  let authenticated = false;
  const trips: unknown[] = [];
  return page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role: 'OWNER' }] } });
    if (url.pathname === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE' }, role: 'OWNER' } });
    if (url.pathname === '/api/organizations/a/tourism/dashboard') return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    if (url.pathname === '/api/organizations/a/tourism/trips') {
      if (request.method() === 'GET') return route.fulfill({ json: { data: trips, pagination: { page: 1, limit: 20, total: trips.length, totalPages: 1 } } });
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        const result = onCreate(body);
        trips.push(result);
        return route.fulfill({ status: 201, json: result });
      }
    }
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

async function fillEssentials(page: import('@playwright/test').Page) {
  await page.locator('#org-trip-title').fill('Trilha do Pico');
  await page.locator('#org-trip-category').fill('Trilha');
  await page.locator('#org-trip-city').fill('Areia');
  await page.locator('#org-trip-region').fill('PB');
  await page.locator('#org-trip-start').fill('2030-08-01T06:00');
  await page.locator('#org-trip-description').fill('Caminhada guiada com paradas para observação.');
}

test('presets de "o que inclui" e de informações importantes se combinam com itens próprios, e a categoria usa a lista do site', async ({ page }) => {
  let created: Record<string, unknown> | null = null;
  await mockOrganizationApi(page, (body) => {
    created = body as Record<string, unknown>;
    return { id: 'trip-1', title: (body as { title: string }).title, category: (body as { category: string }).category, description: (body as { description: string }).description, city: (body as { city: string }).city, region: (body as { region: string }).region, startDateISO: (body as { startDateISO: string }).startDateISO, endDateISO: null, status: 'DRAFT', updatedAt: '2030-01-01T00:00:00.000Z' };
  });
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await fillEssentials(page);

  await page.getByText('O que está incluso e itinerário').click();
  await page.getByRole('checkbox', { name: 'Guia' }).check();
  await page.locator('#org-trip-includes').fill('Banho de rio');
  await page.locator('#org-trip-includes').press('Enter');

  await page.getByRole('checkbox', { name: 'Leve protetor solar e proteção para o sol.' }).check();
  await page.locator('#org-trip-important-info').fill('Idade mínima de 12 anos');
  await page.locator('#org-trip-important-info').press('Enter');

  await page.getByText('Configurações adicionais').click();
  await page.locator('#org-trip-filter-category').selectOption('Trilha');

  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toHaveCount(0);

  expect(created).not.toBeNull();
  const body = created as Record<string, unknown>;
  expect(body.includes).toEqual(['Guia', 'Banho de rio']);
  expect(body.importantInfo).toEqual(['Leve protetor solar e proteção para o sol.', 'Idade mínima de 12 anos']);
  expect(body.filterCategory).toBe('Trilha');
});

test('desmarcar um preset de "o que inclui" o remove sem afetar os itens próprios já adicionados', async ({ page }) => {
  let created: Record<string, unknown> | null = null;
  await mockOrganizationApi(page, (body) => {
    created = body as Record<string, unknown>;
    return { id: 'trip-1', title: (body as { title: string }).title, category: (body as { category: string }).category, description: (body as { description: string }).description, city: (body as { city: string }).city, region: (body as { region: string }).region, startDateISO: (body as { startDateISO: string }).startDateISO, endDateISO: null, status: 'DRAFT', updatedAt: '2030-01-01T00:00:00.000Z' };
  });
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await fillEssentials(page);

  await page.getByText('O que está incluso e itinerário').click();
  await page.getByRole('checkbox', { name: 'Guia' }).check();
  await page.getByRole('checkbox', { name: 'Transporte' }).check();
  await page.locator('#org-trip-includes').fill('Banho de rio');
  await page.locator('#org-trip-includes').press('Enter');
  await page.getByRole('checkbox', { name: 'Guia' }).uncheck();

  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toHaveCount(0);

  expect(created).not.toBeNull();
  expect((created as Record<string, unknown>).includes).toEqual(['Transporte', 'Banho de rio']);
});

test('texto ainda não confirmado em qualquer lista bloqueia salvar, com aviso claro; some ao ser adicionado ou apagado', async ({ page }) => {
  let createCount = 0;
  await mockOrganizationApi(page, (body) => {
    createCount += 1;
    return { id: 'trip-1', title: (body as { title: string }).title, category: (body as { category: string }).category, description: (body as { description: string }).description, city: (body as { city: string }).city, region: (body as { region: string }).region, startDateISO: (body as { startDateISO: string }).startDateISO, endDateISO: null, status: 'DRAFT', updatedAt: '2030-01-01T00:00:00.000Z' };
  });
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await fillEssentials(page);

  await page.getByText('O que está incluso e itinerário').click();
  // Digita mas nunca confirma (nem Enter, nem o botão Adicionar).
  await page.locator('#org-trip-includes').fill('Banho de rio');

  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Adicione ou apague os itens que ainda estão sendo preenchidos antes de salvar.')).toBeVisible();
  expect(createCount).toBe(0);
  // O formulário continua aberto, com o texto digitado preservado (nada se perdeu).
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toBeVisible();
  await expect(page.locator('#org-trip-includes')).toHaveValue('Banho de rio');

  // Apagar o texto pendente também libera o salvamento.
  await page.locator('#org-trip-includes').fill('');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toHaveCount(0);
  expect(createCount).toBe(1);
});
