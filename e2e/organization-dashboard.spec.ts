import { expect, test } from '@playwright/test';

test('visão geral da agência mostra indicadores próprios e abre a lista correspondente', async ({ page }) => {
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { id: 'u', name: 'Usuário', email: 'u@example.test', role: 'editor', legacyAccess: false } });
    if (path === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE' }, role: 'OWNER' } });
    if (path.endsWith('/tourism/dashboard')) return route.fulfill({ json: { trips: { total: 32, upcoming: 20, open: 2, drafts: 30 }, leads: 5, reservations: 4 } });
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/empresa/a/dashboard');
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Rascunhos: 30/ })).toBeVisible();
  await expect(page.getByText('5 interessados')).toBeVisible();
  await page.getByRole('link', { name: /Rascunhos: 30/ }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/trips\?status=DRAFT&period=all$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
