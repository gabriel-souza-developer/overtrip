import { expect, test } from '@playwright/test';

const admin = { id: 'playwright-admin', email: 'playwright@example.test', name: 'Playwright', role: 'admin' };
const trip = (id: string, title: string, startDateISO: string, status = 'OPEN') => ({ id, title, city: 'Lucena', region: 'PB', status, startDateISO, media: [{ src: 'assets/images/a.jpg', alt: 'a' }], priceValue: 100, free: false });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-10T12:00:00.000Z') });
  await page.addInitScript((user) => { localStorage.setItem('auth_token', 'token'); localStorage.setItem('auth_user', JSON.stringify(user)); }, admin);
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: admin });
    if (url.pathname === '/api/trips') {
      const period = url.searchParams.get('period');
      const data = period === 'upcoming' ? [trip('futura', 'Trilha de dezembro', '2026-12-04T00:00:00.000Z')]
        : period === 'past' ? [trip('passada', 'Expedição de outubro', '2026-10-03T00:00:00.000Z', 'COMPLETED')]
          : [trip('futura', 'Trilha de dezembro', '2026-12-04T00:00:00.000Z'), trip('passada', 'Expedição de outubro', '2026-10-03T00:00:00.000Z', 'COMPLETED')];
      return route.fulfill({ json: { data, pagination: { page: 1, limit: 20, total: data.length, totalPages: 1 } } });
    }
    return route.fulfill({ json: {} });
  });
});

test('a lista abre nas próximas viagens e separa as anteriores', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => { const url = new URL(request.url()); if (url.pathname === '/api/trips') requests.push(url.search); });
  await page.goto('/trips');
  await expect(page.getByRole('heading', { name: 'Viagens' })).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Viagens' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Próximas' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'Trilha de dezembro' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Expedição de outubro' })).toHaveCount(0);
  expect(requests[0]).toContain('period=upcoming');

  await page.getByRole('button', { name: 'Anteriores' }).click();
  await expect(page).toHaveURL(/period=past/);
  await expect(page.getByRole('link', { name: 'Expedição de outubro' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Trilha de dezembro' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Foi em' })).toBeVisible();

  await page.getByRole('button', { name: 'Todas' }).click();
  await expect(page.getByRole('link', { name: 'Expedição de outubro' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Trilha de dezembro' })).toBeVisible();
  expect(requests.at(-1)).not.toContain('period=');
});

test('o resumo destaca próximas viagens e separa as concluídas', async ({ page }) => {
  await page.route((url) => url.pathname === '/api/trips', (route) => route.fulfill({ json: { data: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } } }));
  await page.route((url) => url.pathname === '/api/dashboard/stats', (route) => route.fulfill({ json: { tripsTotal: 2, tripsPublished: 1, tripsDraft: 0, visitsTotal: 0, visitsNeedsReview: 0, visitsWithCoords: 0, galleryTotal: 0, galleryFeatured: 0 } }));
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Seu resumo' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Próximas viagens/ })).toHaveAttribute('href', '/trips?period=upcoming');
  await expect(page.getByText('Concluídas ficam em Anteriores')).toBeVisible();
  await expect(page.getByRole('link', { name: /Publicadas no site/ })).toHaveAttribute('href', '/trips?status=OPEN&period=all');
});
