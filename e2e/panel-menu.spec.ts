import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.MENU_SCREENSHOT_DIR;
const admin = { id: 'admin', email: 'admin@example.test', name: 'Admin', role: 'admin' };
const menu = [
  { label: 'Início', heading: 'Visão geral', path: '/dashboard' },
  { label: 'Viagens', heading: 'Viagens', path: '/trips' },
  { label: 'Destinos visitados', heading: 'Destinos visitados', path: '/visits' },
  { label: 'Interessados', heading: 'Interessados', path: '/leads' },
  { label: 'Reservas', heading: 'Reservas', path: '/reservations' },
  { label: 'Galeria de memórias', heading: 'Galeria de memórias', path: '/gallery' },
  { label: 'Configurações', heading: 'Configurações', path: '/settings' },
  { label: 'Saúde do servidor', heading: 'Saúde do servidor', path: '/system' },
];

async function mockApi(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem('auth_token', 'playwright-test-token');
    localStorage.setItem('auth_user', JSON.stringify(user));
  }, admin);
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: admin });
    if (path === '/api/dashboard/stats') return route.fulfill({ json: { tripsTotal: 0, tripsPublished: 0, tripsDraft: 0, visitsNeedsReview: 0 } });
    if (path === '/api/system/health') return route.fulfill({ json: { state: 'ok', checkedAt: new Date().toISOString(), ageMinutes: 0, checks: [] } });
    if (path === '/api/system/health/history') return route.fulfill({ json: [] });
    if (path === '/api/settings/public-faq') return route.fulfill({ json: { version: 0, updatedAt: null, entries: [{ question: 'Pergunta?', answer: 'Resposta.' }] } });
    if (path === '/api/assistant-knowledge') return route.fulfill({ json: null });
    if (path === '/api/assistant-knowledge/versions') return route.fulfill({ json: [] });
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
}

test('menu lateral: cada item abre a tela com o mesmo nome e marca o item ativo', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page);
  await page.goto('/dashboard');
  const nav = page.getByRole('complementary', { name: 'Menu principal' }).getByRole('navigation');
  await expect(nav.getByRole('link')).toHaveText(menu.map(item => item.label));

  for (const item of menu) {
    await nav.getByRole('link', { name: item.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${item.path}$`));
    await expect(page.getByRole('heading', { level: 1, name: item.heading, exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: item.label, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  // Ícones não entram no nome acessível.
  await expect(nav.locator('svg:not([aria-hidden="true"])')).toHaveCount(0);

  await page.goto('/dashboard');
  if (SHOTS) await page.getByRole('complementary', { name: 'Menu principal' }).screenshot({ path: `${SHOTS}/menu-1280.png` });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/painel-1280.png` });
});

test('menu lateral no celular (360 px)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await mockApi(page);
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  const nav = page.getByRole('complementary', { name: 'Menu principal' }).getByRole('navigation');
  await expect(nav.getByRole('link', { name: 'Saúde do servidor', exact: true })).toBeVisible();
  await expect(nav.getByRole('link')).toHaveText(menu.map(item => item.label));
  await page.waitForTimeout(300); // fim da transição de abertura
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/menu-360.png` });
  await nav.getByRole('link', { name: 'Reservas', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reservas', exact: true })).toBeVisible();
});
