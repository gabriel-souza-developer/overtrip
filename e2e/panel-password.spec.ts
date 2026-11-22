import { expect, test, type Page } from '@playwright/test';

// "Trocar senha" é universal (mesma rota /api/auth/change-password para
// qualquer usuário autenticado): este teste cobre o painel OVERTRIP ganhando
// a mesma capacidade que já existia no painel de agência (ver
// e2e/organization-password.spec.ts), através da casca compartilhada
// (PanelShell.tsx).
const admin = { id: 'admin', email: 'admin@example.test', name: 'Admin', role: 'admin', legacyAccess: true };

async function mockApi(page: Page, reject = false) {
  await page.addInitScript((user) => {
    localStorage.setItem('auth_token', 'playwright-test-token');
    localStorage.setItem('auth_user', JSON.stringify(user));
  }, admin);
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: admin });
    if (path === '/api/auth/change-password') return reject ? route.fulfill({ status: 401, json: { error: 'Senha atual incorreta' } }) : route.fulfill({ json: { success: true } });
    if (path === '/api/dashboard/stats') return route.fulfill({ json: { tripsTotal: 0, tripsPublished: 0, tripsDraft: 0, visitsNeedsReview: 0 } });
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
}

async function openPasswordMenuItem(page: Page) {
  await expect(page.getByRole('button', { name: 'Trocar senha', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Minha conta' }).click();
  await page.getByRole('menuitem', { name: 'Trocar senha' }).click();
}

test('administrador troca a senha pelo dropdown Minha conta, igual ao painel de agência', async ({ page }) => {
  await mockApi(page);
  await page.goto('/dashboard');
  await openPasswordMenuItem(page);
  await expect(page.getByRole('dialog', { name: 'Trocar senha' })).toBeVisible();
  await page.getByLabel('Senha atual').fill('senha-antiga');
  await page.locator('#new-password').fill('nova-senha-123');
  await page.getByLabel('Confirmar nova senha').fill('nova-senha-123');
  await page.getByRole('button', { name: 'Alterar senha' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toHaveText('Senha alterada. Entre novamente com sua nova senha.');
});

test('a troca de senha está disponível no menu da conta', async ({ page }) => {
  await mockApi(page);
  await page.goto('/dashboard');
  await openPasswordMenuItem(page);
  await expect(page.getByRole('dialog', { name: 'Trocar senha' })).toBeVisible();
});

test('senha atual incorreta mantém o diálogo aberto e o administrador conectado', async ({ page }) => {
  await mockApi(page, true);
  await page.goto('/dashboard');
  await openPasswordMenuItem(page);
  await page.getByLabel('Senha atual').fill('senha-errada');
  await page.locator('#new-password').fill('nova-senha-123');
  await page.getByLabel('Confirmar nova senha').fill('nova-senha-123');
  await page.getByRole('button', { name: 'Alterar senha' }).click();
  await expect(page.getByRole('alert')).toContainText('Senha atual incorreta');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('menu da conta no celular (360 px) abre troca de senha sem alargar o cabeçalho', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await mockApi(page);
  await page.goto('/dashboard');
  await openPasswordMenuItem(page);
  await expect(page.getByRole('dialog', { name: 'Trocar senha' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
