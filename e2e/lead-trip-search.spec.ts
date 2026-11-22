import { expect, test, type Page } from '@playwright/test';

async function authenticate(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'token');
    localStorage.setItem('auth_user', JSON.stringify({ id: '1', email: 'admin@example.test', name: 'Admin', role: 'admin' }));
  });
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: '1', email: 'admin@example.test', role: 'admin' } }));
}

const pagination = { page: 1, total: 1, totalPages: 1, limit: 20 };
const lead = { id: 'lead1', name: 'Ana', phone: null, email: null, stage: 'NEW', tripId: 'old-trip', trip: { id: 'old-trip', title: 'Viagem anterior' }, responsible: null, nextFollowUpAt: null, notes: null };

test('busca viagens em páginas, preserva o vínculo e não envia com Enter', async ({ page }) => {
  await authenticate(page);
  let saved: Record<string, unknown> | undefined;
  await page.route(/\/api\/leads(?:\?|\/|$)/, route => {
    if (route.request().method() === 'PUT') { saved = route.request().postDataJSON(); return route.fulfill({ json: lead }); }
    return route.fulfill({ json: { data: [lead], pagination } });
  });
  await page.route('**/api/trips?*', route => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('limit')).toBe('20');
    const n = Number(query.get('page'));
    return route.fulfill({ json: { data: [{ id: `trip-${n}`, title: `Viagem ${n}` }], pagination: { page: n, total: 2, totalPages: 2, limit: 20 } } });
  });
  await page.goto('/leads');
  await page.getByRole('button', { name: 'Editar' }).click();
  await expect(page.locator('#lead-trip')).toHaveValue('old-trip');
  await page.getByLabel('Buscar viagem').fill('outra');
  await page.getByLabel('Buscar viagem').press('Enter');
  expect(saved).toBeUndefined();
  await page.getByRole('button', { name: 'Carregar mais viagens' }).click();
  await expect(page.locator('#lead-trip option[value="trip-2"]')).toBeAttached();
  await expect(page.locator('#lead-trip')).toHaveValue('old-trip');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect.poll(() => saved?.tripId).toBe('old-trip');
});

test('falha de viagens permite cadastro sem associação', async ({ page }) => {
  await authenticate(page);
  let saved: Record<string, unknown> | undefined;
  await page.route('**/api/trips?*', route => route.fulfill({ status: 500, json: { error: 'Indisponível' } }));
  await page.route(/\/api\/leads(?:\?|\/|$)/, route => {
    if (route.request().method() === 'POST') { saved = route.request().postDataJSON(); return route.fulfill({ status: 201, json: lead }); }
    return route.fulfill({ json: { data: [], pagination: { ...pagination, total: 0, totalPages: 0 } } });
  });
  await page.goto('/leads');
  await page.getByRole('button', { name: 'Novo interessado' }).click();
  await expect(page.getByRole('button', { name: 'Tentar carregar viagens novamente' })).toBeVisible();
  await page.locator('#lead-name').fill('Cliente sem viagem');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect.poll(() => saved?.name).toBe('Cliente sem viagem');
  expect(saved?.tripId).toBeNull();
});

test('resposta antiga não substitui resultado do filtro atual nem reaparece após erro', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/leads?*', async route => {
    const stage = new URL(route.request().url()).searchParams.get('stage');
    if (stage === 'CONTACTED') { await new Promise(resolve => setTimeout(resolve, 800)); return route.fulfill({ json: { data: [{ ...lead, name: 'Resposta antiga' }], pagination } }); }
    if (stage === 'LOST') return route.fulfill({ status: 500, json: { error: 'Falha' } });
    return route.fulfill({ json: { data: [{ ...lead, name: stage === 'WON' ? 'Resposta atual' : 'Inicial' }], pagination } });
  });
  await page.goto('/leads');
  await expect(page.getByText('Inicial', { exact: true })).toBeVisible();
  await page.locator('#lead-stage').selectOption('CONTACTED');
  await page.locator('#lead-stage').selectOption('WON');
  await expect(page.getByText('Resposta atual', { exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText('Resposta antiga', { exact: true })).toHaveCount(0);
  await page.locator('#lead-stage').selectOption('LOST');
  await expect(page.getByRole('button', { name: 'Tentar carregar interessados novamente' })).toBeVisible();
  await expect(page.getByText('Resposta atual', { exact: true })).toHaveCount(0);
});

test('retorno em UTC aparece no dia de São Paulo também na edição', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/leads?*', route => route.fulfill({ json: { data: [{ ...lead, nextFollowUpAt: '2026-11-17T01:00:00.000Z' }], pagination } }));
  await page.route('**/api/trips?*', route => route.fulfill({ json: { data: [], pagination: { ...pagination, total: 0, totalPages: 0 } } }));
  await page.goto('/leads');
  await expect(page.getByText(/Retorno: 16\/11\/2026/)).toBeVisible();
  await page.getByRole('button', { name: 'Editar' }).click();
  await expect(page.locator('#lead-next')).toHaveValue('2026-11-16');
});
