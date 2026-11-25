import { expect, test } from '@playwright/test';

test('agência usa navegação lateral no celular e mantém os dados da empresa', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { id: 'u', name: 'Operador', email: 'u@example.test', role: 'editor', legacyAccess: false } });
    if (path === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência Exemplo', slug: 'a', status: 'ACTIVE' }, role: 'OWNER' } });
    if (path.endsWith('/tourism/dashboard')) return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
  await page.goto('/empresa/a/dashboard');
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  const nav = page.getByRole('navigation', { name: 'Navegação da empresa' });
  await expect(nav.getByRole('link', { name: 'Início' })).toBeVisible();
  await nav.getByRole('link', { name: 'Viagens' }).click();
  await expect(page.getByRole('heading', { name: 'Viagens', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Período das viagens' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await nav.getByRole('link', { name: 'Destinos visitados' }).click();
  await expect(page.getByRole('heading', { name: 'Destinos visitados' })).toBeVisible();
  await expect(page.getByText('Nenhum destino encontrado')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await nav.getByRole('link', { name: 'Galeria de memórias' }).click();
  await expect(page.getByRole('heading', { name: 'Galeria de memórias' })).toBeVisible();
  await expect(page.getByText('Nenhuma memória encontrada')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('menu móvel da agência: o fundo fica inert e o foco não escapa dele enquanto aberto', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { id: 'u', name: 'Operador', email: 'u@example.test', role: 'editor', legacyAccess: false } });
    if (path === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência Exemplo', slug: 'a', status: 'ACTIVE', defaultPriceUnit: null }, role: 'OWNER' } });
    if (path.endsWith('/tourism/dashboard')) return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
  await page.goto('/empresa/a/dashboard');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.waitForTimeout(300);

  expect(await page.evaluate(() => document.querySelector('header')?.closest('[inert]') != null)).toBe(true);

  const focusable = page.getByRole('complementary', { name: 'Menu principal' }).locator('button, a[href]');
  const count = await focusable.count();
  await focusable.first().focus();
  for (let i = 0; i < count; i++) await page.keyboard.press('Tab');
  await expect(focusable.first()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.locator('[aria-label="Menu principal"]')).toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeFocused();
});
