import { expect, test } from '@playwright/test';

const SHOTS = process.env.MENU_SCREENSHOT_DIR;
const admin = { id: 'admin', email: 'admin@example.test', name: 'Admin', role: 'admin', legacyAccess: true };
const visit = (id: string, title: string, date: string) => ({ id, title, city: 'Areia', region: 'PB', date, lat: null, lng: null, needsReview: false, description: null, notes: null, tripId: null, images: [] });

test('destinos visitados: filtra por ano e mês a partir do histórico de visitas', async ({ page }) => {
  const requested: URLSearchParams[] = [];
  await page.addInitScript((user) => { localStorage.setItem('auth_token', 'token'); localStorage.setItem('auth_user', JSON.stringify(user)); }, admin);
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: admin });
    if (url.pathname === '/api/visits/periods') return route.fulfill({ json: { periods: [{ year: 2026, month: 8, count: 2 }, { year: 2026, month: 7, count: 1 }, { year: 2025, month: 12, count: 1 }], undated: 0 } });
    if (url.pathname === '/api/visits') {
      requested.push(url.searchParams);
      const data = url.searchParams.get('month') === '8' ? [visit('a', 'Caminhos do Frio', '2026-08-20T12:00:00.000Z'), visit('b', 'Bananeiras', '2026-08-21T12:00:00.000Z')] : [visit('c', 'Lajedo', '2025-12-01T12:00:00.000Z')];
      return route.fulfill({ json: { data, pagination: { page: 1, limit: 20, total: data.length, totalPages: 1 } } });
    }
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
  await page.goto('/visits');
  const monthSelect = page.getByLabel('Filtrar por mês da visita');
  await expect(monthSelect).toBeDisabled();
  await page.getByLabel('Filtrar por ano da visita').selectOption('2026');
  await expect(page).toHaveURL(/year=2026/);
  await expect(monthSelect).toBeEnabled();
  await expect(monthSelect.locator('option')).toHaveText(['Todos os meses', 'Julho (1 visita)', 'Agosto (2 visitas)']);
  await monthSelect.selectOption('8');
  await expect(page).toHaveURL(/year=2026.*month=8|month=8.*year=2026/);
  await expect(page.getByRole('status').filter({ hasText: '2 destinos visitados em agosto de 2026.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Caminhos do Frio', exact: true })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/visitados-filtro-mes.png`, fullPage: true });
  expect(requested.at(-1)?.get('year')).toBe('2026');
  expect(requested.at(-1)?.get('month')).toBe('8');
  // Trocar para um ano sem agosto limpa o mês.
  await page.getByLabel('Filtrar por ano da visita').selectOption('2025');
  await expect(page).not.toHaveURL(/month=/);
  await expect(page.getByRole('button', { name: 'Lajedo', exact: true })).toBeVisible();
});

test('Início: orientação sazonal acompanha o mês do calendário e avisa que não é previsão', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-10T12:00:00.000Z') });
  await page.addInitScript((user) => { localStorage.setItem('auth_token', 'token'); localStorage.setItem('auth_user', JSON.stringify(user)); }, admin);
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: admin });
    if (url.pathname === '/api/dashboard/stats') return route.fulfill({ json: { tripsTotal: 0, tripsPublished: 0, tripsDraft: 0, visitsNeedsReview: 0 } });
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 1 } } });
  });
  await page.goto('/dashboard');
  const guide = page.getByRole('region', { name: /O que costuma funcionar em/ });
  await expect(guide.getByRole('heading', { name: 'O que costuma funcionar em Novembro de 2026' })).toBeVisible();
  await expect(guide.getByText('Orientação climatológica, não é previsão')).toBeVisible();
  await expect(guide.getByText('Nenhuma região está no período chuvoso típico', { exact: false })).toBeVisible();
  await expect(guide.getByRole('link', { name: /INMET — Avisos/ })).toBeHidden();
  await page.getByLabel('Mês do calendário').selectOption('3');
  await expect(guide.getByRole('heading', { name: 'O que costuma funcionar em Abril de 2026' })).toBeVisible();
  await expect(guide.getByRole('listitem').filter({ hasText: 'Litoral, Brejo e Agreste' })).toContainText('Início do período chuvoso');
  await expect(guide.getByRole('listitem').filter({ hasText: /^Alto Sertão/ })).toContainText('Fim do período chuvoso');
  await guide.getByText('Fontes, opiniões de visitantes e previsão atual').click();
  await expect(guide.getByRole('link', { name: /INMET — Avisos/ })).toHaveAttribute('href', 'https://avisos.inmet.gov.br');
  await expect(guide.getByText(/Opiniões de visitantes são subjetivas/)).toBeVisible();
  await page.getByRole('button', { name: 'Hoje' }).click();
  await expect(guide.getByRole('heading', { name: 'O que costuma funcionar em Novembro de 2026' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/inicio-sazonal.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
