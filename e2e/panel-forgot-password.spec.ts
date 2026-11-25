import { expect, test, type Page } from '@playwright/test';

// O painel padrão (sem VITE_PLATFORM_MODE) precisa servir as telas de
// recuperação: antes, /esqueci-senha caía no redirecionamento para /login.
async function mockApi(page: Page, calls: { forgot: unknown[]; reset: unknown[] }) {
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ status: 401, json: { error: 'Não autenticado' } });
    if (path === '/api/auth/forgot-password') {
      calls.forgot.push(request.postDataJSON());
      return route.fulfill({ json: { success: true, message: 'ok' } });
    }
    if (path === '/api/auth/reset-password') {
      calls.reset.push(request.postDataJSON());
      return route.fulfill({ json: { success: true, message: 'ok' } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
}

test('link Esqueci minha senha abre a tela de recuperação e envia o pedido', async ({ page }) => {
  const calls = { forgot: [] as unknown[], reset: [] as unknown[] };
  await mockApi(page, calls);
  await page.goto('/login');
  await expect(page.getByText('01 — 01')).toHaveCount(0);
  await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
  await expect(page).toHaveURL(/\/esqueci-senha$/);
  await expect(page.getByRole('heading', { name: 'Esqueci minha senha' })).toBeVisible();
  await page.getByLabel('E-mail').fill('pessoa@example.test');
  await page.getByRole('button', { name: /Enviar link de redefinição/ }).click();
  await expect(page.getByRole('status')).toContainText('Se existir uma conta');
  expect(calls.forgot).toEqual([{ email: 'pessoa@example.test' }]);
});

test('link do e-mail abre a redefinição, consome o token e volta ao login', async ({ page }) => {
  const calls = { forgot: [] as unknown[], reset: [] as unknown[] };
  await mockApi(page, calls);
  await page.goto('/redefinir-senha#token=token-de-teste');
  await expect(page).toHaveURL(/\/redefinir-senha$/);
  await page.locator('#new-password').fill('nova-senha-123');
  await page.locator('#confirm-password').fill('nova-senha-123');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/login$/);
  expect(calls.reset).toEqual([{ token: 'token-de-teste', newPassword: 'nova-senha-123' }]);
});
