import { expect, test } from '@playwright/test';

test('calendário do painel mostra viagens de todas as páginas, navega por mês e abre a edição', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date('2026-11-10T12:00:00.000Z') });
  await page.addInitScript(() => { localStorage.setItem('auth_token', 'token'); localStorage.setItem('auth_user', JSON.stringify({ id: '1', email: 'admin@example.test', name: 'Admin', role: 'admin' })); });
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: '1', email: 'admin@example.test', name: 'Admin', role: 'admin' } }));
  await page.route('**/api/dashboard/stats', route => route.fulfill({ json: { tripsTotal: 2, tripsPublished: 1, tripsDraft: 1, visitsTotal: 0, visitsNeedsReview: 0, visitsWithCoords: 0, galleryTotal: 0, galleryFeatured: 0 } }));
  await page.route('**/api/trips?*', route => {
    const n = new URL(route.request().url()).searchParams.get('page');
    return route.fulfill({ json: { data: n === '2' ? [{ id: 'segunda', title: 'Viagem da segunda página', city: 'Lucena', region: 'PB', status: 'OPEN', startDateISO: '2026-11-29T00:00:00.000Z' }] : [{ id: 'primeira', title: 'Viagem de dezembro', city: 'Natal', region: 'RN', status: 'DRAFT', startDateISO: '2026-12-04T00:00:00.000Z' }], pagination: { page: Number(n), totalPages: 2, total: 2, limit: 100 } } });
  });
  await page.goto('/dashboard');
  const calendar = page.getByRole('region', { name: 'Agenda de viagens' });
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect(calendar.getByRole('heading', { name: 'Próximas viagens' })).toBeVisible();
  await expect(calendar.getByRole('link', { name: /Viagem da segunda página/ }).first()).toBeVisible();
  await expect(calendar.getByRole('button', { name: '29/11/2026, 1 viagem(ns)' })).toBeVisible();
  await calendar.getByRole('button', { name: '29/11/2026, 1 viagem(ns)' }).click();
  await expect(calendar.getByRole('link', { name: /Viagem da segunda página/ }).last()).toHaveAttribute('href', '/trips/segunda/edit');
  await calendar.getByRole('button', { name: 'Próximo mês' }).click();
  await calendar.getByRole('button', { name: '04/12/2026, 1 viagem(ns)' }).click();
  await expect(calendar.getByRole('link', { name: /Viagem de dezembro/ }).last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
