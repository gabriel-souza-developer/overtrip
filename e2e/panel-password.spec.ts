import { expect, test } from '@playwright/test';

const admin = { id: 'admin', email: 'admin@example.test', name: 'Admin', role: 'admin' };

test('administrador troca a senha pelo dropdown da conta', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: admin }));
  await page.route('**/api/auth/change-password', route => route.fulfill({ json: { success: true } }));
  await page.goto('/dashboard');

  await page.getByRole('button', { name: 'Minha conta' }).click();
  await expect(page.getByRole('menuitem', { name: 'Trocar senha' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Trocar senha' }).click();
  await expect(page.getByRole('button', { name: 'Trocar senha' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Trocar senha' })).toBeVisible();
  await page.getByLabel('Senha atual').fill('senha-antiga');
  await page.locator('#new-password').fill('senha-nova-123');
  await page.getByLabel('Confirmar nova senha').fill('senha-nova-123');
  await page.getByRole('button', { name: 'Alterar senha' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toHaveText('Senha alterada. Entre novamente com sua nova senha.');
});
