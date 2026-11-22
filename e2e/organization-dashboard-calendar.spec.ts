import { expect, test } from '@playwright/test';

const novTrip = { id: 'nov-trip', title: 'Passeio de novembro', category: 'Passeio', description: '', city: 'Lucena', region: 'PB', status: 'OPEN', startDateISO: '2026-11-29T00:00:00.000Z', endDateISO: null, updatedAt: '2026-01-01T00:00:00.000Z' };
const dezTrip = { id: 'dez-trip', title: 'Passeio de dezembro', category: 'Passeio', description: '', city: 'Natal', region: 'RN', status: 'DRAFT', startDateISO: '2026-12-04T00:00:00.000Z', endDateISO: null, updatedAt: '2026-01-01T00:00:00.000Z' };

function mockOrganizationApi(page: import('@playwright/test').Page, role: 'OWNER' | 'MEMBER', { withTrips }: { withTrips: boolean }) {
  return page.route(url => url.pathname.startsWith('/api/'), route => {
    const requestUrl = new URL(route.request().url());
    const path = requestUrl.pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { id: 'u', name: 'Agente', email: 'u@example.test', role: 'editor', legacyAccess: false } });
    if (path === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência Exemplo', slug: 'a', status: 'ACTIVE' }, role } });
    if (path.endsWith('/tourism/dashboard')) return route.fulfill({ json: { trips: { total: withTrips ? 2 : 0, upcoming: withTrips ? 2 : 0, open: 0, drafts: 0 } } });
    if (path.endsWith('/tourism/trips/calendar')) {
      const start = requestUrl.searchParams.get('start');
      const end = requestUrl.searchParams.get('end');
      if (!withTrips) return route.fulfill({ json: { data: [], total: 0, truncated: false, range: { start, end } } });
      const data = start === '2026-11-01' ? [novTrip] : start === '2026-12-01' ? [dezTrip] : [];
      return route.fulfill({ json: { data, total: data.length, truncated: false, range: { start, end } } });
    }
    if (path.endsWith('/tourism/trips') && requestUrl.searchParams.get('period') === 'upcoming') {
      const data = withTrips ? [novTrip] : [];
      return route.fulfill({ json: { data, pagination: { page: 1, limit: 4, total: data.length, totalPages: data.length ? 1 : 0 } } });
    }
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
}

test('agenda da empresa mostra viagens do mês, navega por mês e abre a lista própria filtrada', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-10T12:00:00.000Z') });
  await mockOrganizationApi(page, 'OWNER', { withTrips: true });
  await page.goto('/empresa/a/dashboard');
  const calendar = page.getByRole('region', { name: 'Agenda de viagens' });
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect(calendar.getByRole('heading', { name: 'Próximas viagens' })).toBeVisible();
  await expect(calendar.getByRole('link', { name: /Passeio de novembro/ }).first()).toBeVisible();
  await expect(calendar.getByRole('button', { name: '29/11/2026, 1 viagem(ns)' })).toBeVisible();

  await calendar.getByRole('button', { name: '29/11/2026, 1 viagem(ns)' }).click();
  const novLink = calendar.getByRole('link', { name: /Passeio de novembro/ }).last();
  await expect(novLink).toBeVisible();
  // Não há página de edição própria da viagem no painel da empresa: o link
  // sempre leva à lista de viagens DA PRÓPRIA empresa (nunca a uma rota
  // legada ou de edição direta que o papel não teria).
  await expect(novLink).toHaveAttribute('href', '/empresa/a/trips?period=all&search=Passeio%20de%20novembro');

  await calendar.getByRole('button', { name: 'Próximo mês' }).click();
  await calendar.getByRole('button', { name: '04/12/2026, 1 viagem(ns)' }).click();
  const dezLink = calendar.getByRole('link', { name: /Passeio de dezembro/ }).last();
  await expect(dezLink).toHaveAttribute('href', '/empresa/a/trips?period=all&search=Passeio%20de%20dezembro');

  await calendar.getByRole('link', { name: /Ver todas as viagens/ }).click();
  await expect(page).toHaveURL('/empresa/a/trips?period=all');
});

test('agenda da empresa funciona no celular, sem rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date('2026-11-10T12:00:00.000Z') });
  await mockOrganizationApi(page, 'OWNER', { withTrips: true });
  await page.goto('/empresa/a/dashboard');
  const calendar = page.getByRole('region', { name: 'Agenda de viagens' });
  await expect(calendar.getByRole('heading', { name: 'Calendário de viagens' })).toBeVisible();
  await expect(calendar.getByRole('button', { name: '29/11/2026, 1 viagem(ns)' })).toBeVisible();
  await calendar.getByRole('button', { name: '29/11/2026, 1 viagem(ns)' }).click();
  await expect(calendar.getByRole('link', { name: /Passeio de novembro/ }).last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('MEMBER vê a agenda sem CRM e sem oferta de criar viagem quando não pode gerenciar', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-10T12:00:00.000Z') });
  await mockOrganizationApi(page, 'MEMBER', { withTrips: false });
  await page.goto('/empresa/a/dashboard');
  const calendar = page.getByRole('region', { name: 'Agenda de viagens' });
  await expect(calendar.getByText('Nenhuma viagem programada a partir de hoje.')).toBeVisible();
  await expect(calendar.getByRole('link', { name: 'Organizar viagens' })).toHaveCount(0);
  await expect(calendar.getByRole('link', { name: /Ver viagens anteriores/ })).toBeVisible();
  // MEMBER não tem acesso a Interessados/Reservas (CRM), mas a agenda de viagens continua disponível.
  await expect(page.getByRole('navigation', { name: 'Navegação da empresa' }).getByRole('link', { name: 'Interessados' })).toHaveCount(0);
});
