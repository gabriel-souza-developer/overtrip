import { expect, test } from '@playwright/test';

test('vincula a reserva a um interessado da viagem escolhida', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('auth_token', 'token'); localStorage.setItem('auth_user', JSON.stringify({ id: '1', email: 'admin@example.test', name: 'Admin', role: 'admin' })); });
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: '1', email: 'admin@example.test', name: 'Admin', role: 'admin' } }));
  await page.route('**/api/trips?*', route => route.fulfill({ json: { data: [{ id: 'trip1', title: 'Lucena' }, { id: 'trip2', title: 'Outra' }], pagination: { page: 1, totalPages: 1, total: 2, limit: 100 } } }));
  await page.route('**/api/leads?*', route => route.fulfill({ json: { data: [{ id: 'lead1', name: 'Ana', tripId: 'trip1' }, { id: 'lead2', name: 'Bia', tripId: 'trip2' }], pagination: { page: 1, totalPages: 1, total: 2 } } }));
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/reservations**', async route => {
    if (route.request().method() === 'POST') { submitted = route.request().postDataJSON(); await route.fulfill({ status: 201, json: { id: 'res1' } }); }
    else await route.fulfill({ json: { data: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } } });
  });
  await page.goto('/reservations');
  await page.getByRole('button', { name: 'Nova reserva' }).click();
  await expect(page.locator('#res-trip option[value="trip1"]')).toBeAttached();
  await page.locator('#res-trip').selectOption('trip1');
  await expect(page.getByLabel('Interessado vinculado').getByRole('option', { name: 'Ana' })).toBeAttached();
  await expect(page.getByLabel('Interessado vinculado').getByRole('option', { name: 'Bia' })).toHaveCount(0);
  await page.getByLabel('Interessado vinculado').selectOption('lead1');
  await page.getByLabel('Nome do responsável').fill('Ana');
  await page.getByLabel('Valor total (R$)').fill('100,00');
  await page.getByRole('button', { name: 'Cadastrar reserva' }).click();
  await expect.poll(() => submitted?.leadId).toBe('lead1');
});
