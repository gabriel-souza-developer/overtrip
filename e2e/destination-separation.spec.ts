import { expect, test } from '@playwright/test';

test('destinos a conhecer e histórico usam filtros separados e o financeiro abre o histórico', async ({ page }) => {
  const admin = { id: 'admin', email: 'admin@example.test', name: 'Admin', role: 'admin', legacyAccess: true };
  const base = {
    city: null, region: null, category: null, status: 'IDEA', originCity: null, distanceKm: null,
    trailLevel: null, bestSeason: null, notes: null, links: [], imported: false,
    createdAt: '', updatedAt: '', site: { onMap: false, visits: [], trips: [] },
    summary: { outingsCount: 0, lastOutingDate: null, averagePassengers: null, averagePricePerPersonCents: null, averageExpenseCents: null, averageResultCents: null },
  };
  const idea = { ...base, id: 'idea', name: 'Lugar a conhecer', outings: [] };
  const history = { ...base, id: 'history', name: 'Lugar já visitado', summary: { ...base.summary, outingsCount: 1 }, outings: [{ id: 'outing', date: null, passengers: null, courtesySeats: null, pricePerPersonCents: null, expenseCents: null, resultCents: null, supplier: null, notes: null, onSite: false }] };
  const requested: string[] = [];
  await page.addInitScript((user) => {
    localStorage.setItem('auth_token', 'playwright-test-token');
    localStorage.setItem('auth_user', JSON.stringify(user));
  }, admin);
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: admin });
    if (url.pathname === '/api/destinations') {
      const visited = url.searchParams.get('visited') ?? '';
      requested.push(visited);
      const data = visited === 'false' ? [idea] : visited === 'true' ? [history] : [];
      return route.fulfill({ json: { data, pagination: { page: 1, limit: 30, total: data.length, totalPages: 1 } } });
    }
    if (url.pathname === '/api/finance/summary') return route.fulfill({ json: {
      outings: { years: [], year: null, totals: { outings: 0, completeOutings: 0, passengers: 0, courtesySeats: 0, revenueCents: 0, expenseCents: 0, resultCents: 0, marginPct: null, averageTicketCents: null, averageResultCents: null }, incompleteOutings: 0, byYear: [], byMonth: [], byDestination: [], outings: [] },
      reservations: { activeReservations: 0, seats: 0, contractedCents: 0, receivedCents: 0, receivableCents: 0, openInstallmentsCents: 0, overdueCents: 0, overdueInstallments: 0, dueNext30DaysCents: 0, pendingInstallments: [] },
    } });
    return route.fulfill({ json: {} });
  });

  await page.goto('/destination-bank');
  await expect(page.getByRole('heading', { name: 'Lugar a conhecer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lugar já visitado' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /sincronizar/i })).toHaveCount(0);
  expect(requested.at(-1)).toBe('false');

  await page.goto('/finance');
  await page.getByRole('link', { name: 'Abrir histórico de saídas' }).click();
  await expect(page).toHaveURL(/\/destination-history$/);
  await expect(page.getByRole('heading', { name: 'Lugar já visitado' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lugar a conhecer' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /sincronizar/i })).toHaveCount(0);
  expect(requested.at(-1)).toBe('true');
});
