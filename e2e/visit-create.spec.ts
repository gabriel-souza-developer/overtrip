import { expect, test } from '@playwright/test';

test('cadastra destino visitado sem viagem e preserva coordenadas confirmadas', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'playwright-test-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: 'admin', email: 'admin@example.test', name: 'Admin', role: 'admin' }));
  });
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'admin', email: 'admin@example.test', name: 'Admin', role: 'admin' } }));
  await page.route('**/api/visits**', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({ title: 'Mirante', city: 'Lucena', region: 'PB', lat: -6.9, lng: -34.9, needsReview: false });
      expect(body.tripId).toBeUndefined();
      return route.fulfill({ status: 201, json: { id: 'novo', ...body } });
    }
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
  await page.route('https://photon.komoot.io/api/**', route => route.fulfill({ json: { features: [{ geometry: { coordinates: [-34.9, -6.9] }, properties: { name: 'Mirante', city: 'Lucena', state: 'Paraíba', countrycode: 'BR' } }] } }));

  await page.goto('/visits');
  await page.getByRole('button', { name: 'Adicionar destino' }).click();
  await page.getByLabel('Nome do destino').fill('Mirante');
  await page.getByLabel('Pesquisar localização').fill('Mirante Lucena');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await page.getByRole('button', { name: 'Usar esta localização' }).click();
  await expect(page.getByText('Cidade e estado preenchidos: Lucena/PB.')).toBeVisible();
  const request = page.waitForRequest(request => request.url().includes('/api/visits') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Salvar e marcar como revisado' }).click();
  await request;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Destino salvo.')).toBeVisible();
});
