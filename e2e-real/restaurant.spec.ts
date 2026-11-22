import { expect, test } from '@playwright/test';

test('restaurante registra mesa e reserva, impede conflito e persiste após recarregar', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('restaurante-e2e@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('senha-e2e-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/espaco/);
  await expect(page.getByRole('heading', { name: 'Restaurante fictício E2E' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir operação' }).click();
  await page.getByRole('button', { name: 'Cadastrar mesa', exact: true }).click();
  await page.getByLabel('Nome da mesa').fill('Mesa 7');
  await page.getByLabel('Capacidade (lugares)').fill('4');
  await page.locator('#restaurant-table-form').getByRole('button', { name: 'Cadastrar mesa' }).click();
  await page.getByRole('button', { name: 'Nova reserva', exact: true }).click();
  await page.locator('#booking-table').selectOption({ label: 'Mesa 7 · até 4' });
  await page.locator('#booking-guest').fill('Grupo fictício');
  await page.getByLabel('Tamanho do grupo').fill('3');
  await page.locator('#booking-date').fill('2030-12-10');
  await page.getByLabel('Turno').selectOption('JANTAR');
  await page.getByLabel('Horário').fill('20:00');
  await page.getByRole('button', { name: 'Registrar reserva' }).click();
  const booking = page.getByRole('article').filter({ hasText: 'Grupo fictício' });
  await expect(booking).toContainText('Confirmada');

  await page.getByRole('button', { name: 'Nova reserva', exact: true }).click();
  await page.locator('#booking-table').selectOption({ label: 'Mesa 7 · até 4' });
  await page.locator('#booking-guest').fill('Grupo conflitante');
  await page.getByLabel('Tamanho do grupo').fill('2');
  await page.locator('#booking-date').fill('2030-12-10');
  await page.getByLabel('Turno').selectOption('JANTAR');
  await page.getByLabel('Horário').fill('21:00');
  await page.getByRole('button', { name: 'Registrar reserva' }).click();
  await expect(page.getByRole('alert')).toContainText('reservada');
  await expect(page.getByRole('article').filter({ hasText: 'Grupo conflitante' })).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: 'Abrir operação' }).click();
  await expect(booking).toContainText('Mesa 7');
  await expect(booking).toContainText('Confirmada');
  await expect(page.getByRole('article').filter({ hasText: 'Grupo conflitante' })).toHaveCount(0);
});
