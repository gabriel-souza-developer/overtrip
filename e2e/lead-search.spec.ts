import { expect, test } from '@playwright/test';

test('busca interessados na API, combina filtros e ignora resposta antiga', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'token');
    localStorage.setItem('auth_user', JSON.stringify({ id: '1', email: 'admin@example.test', role: 'admin', legacyAccess: true }));
  });
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: '1', email: 'admin@example.test', role: 'admin', legacyAccess: true } }));
  const requests: string[] = [];
  await page.route('**/api/leads?*', async route => {
    const query = new URL(route.request().url()).searchParams;
    const term = query.get('search') || '';
    requests.push(query.toString());
    if (term === 'Ana') await new Promise(resolve => setTimeout(resolve, 1000));
    return route.fulfill({ json: {
      data: [{ id: term || 'initial', name: term || 'Inicial', stage: 'NEW', trip: null, tripId: null, responsible: null, nextFollowUpAt: null }],
      pagination: { page: Number(query.get('page')), totalPages: 2, total: 21 },
    } });
  });
  await page.goto('/leads');
  await expect(page.getByText('Inicial', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(page.getByText('Página 2 de 2')).toBeVisible();
  await page.locator('#lead-stage').selectOption('CONTACTED');
  await page.locator('#lead-follow-up').selectOption('due');
  const search = page.getByLabel('Buscar interessado');
  await search.fill('Ana');
  await expect.poll(() => requests.some(value => new URLSearchParams(value).get('search') === 'Ana')).toBe(true);
  await search.fill('Bea');
  await expect(page.getByText('Bea', { exact: true })).toBeVisible();
  await page.waitForTimeout(1100);
  await expect(page.getByText('Ana', { exact: true })).toHaveCount(0);
  const final = requests.map(value => new URLSearchParams(value)).find(value => value.get('search') === 'Bea');
  expect(final?.get('page')).toBe('1');
  expect(final?.get('stage')).toBe('CONTACTED');
  expect(final?.get('followUp')).toBe('due');
  await search.clear();
  await expect(page.getByText('Inicial', { exact: true })).toBeVisible();
});
