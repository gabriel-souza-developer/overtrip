import { expect, test, type Page } from '@playwright/test';

async function openPasswordMenuItem(page: Page) {
  await expect(page.getByRole('button', { name: 'Trocar senha', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Minha conta' }).click();
  await page.getByRole('menuitem', { name: 'Trocar senha' }).click();
}

async function setup(page: Page, reject = false) {
  let logouts = 0;
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { id: 'u', name: 'Usuário', email: 'u@example.test', role: 'editor', legacyAccess: false } });
    if (path === '/api/auth/change-password') return reject ? route.fulfill({ status: 401, json: { error: 'Senha atual incorreta' } }) : route.fulfill({ json: { success: true } });
    if (path === '/api/auth/logout') { logouts++; return route.fulfill({ status: 204 }); }
    if (path === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE' }, role: 'OWNER' } });
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
  await page.goto('/empresa/a/trips');
  await openPasswordMenuItem(page);
  return () => logouts;
}

test('troca senha, limpa sessão e retorna ao login sem chamar logout', async ({ page }) => {
  const logouts = await setup(page);
  await page.getByLabel('Senha atual').fill('senha-antiga');
  await page.locator('#new-password').fill('nova-senha-123');
  await page.getByLabel('Confirmar nova senha').fill('nova-senha-123');
  await page.getByRole('button', { name: 'Alterar senha' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toHaveText('Senha alterada. Entre novamente com sua nova senha.');
  expect(logouts()).toBe(0);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('nova-senha-123');
});

test('recusa confirmação incorreta e preserva campos ao cancelar descarte', async ({ page }) => {
  await setup(page);
  await page.getByLabel('Senha atual').fill('senha-antiga');
  await page.locator('#new-password').fill('nova-senha-123');
  await page.getByLabel('Confirmar nova senha').fill('diferente');
  await page.getByRole('button', { name: 'Alterar senha' }).click();
  await expect(page.getByRole('alert')).toHaveText('A confirmação não corresponde à nova senha.');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Descartar alteração?' });
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByLabel('Senha atual')).toHaveValue('senha-antiga');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await confirm.getByRole('button', { name: 'Descartar' }).click();
  await openPasswordMenuItem(page);
  await expect(page.getByLabel('Senha atual')).toHaveValue('');
});

test('senha atual incorreta mantém formulário aberto e usuário conectado', async ({ page }) => {
  await setup(page, true);
  await page.getByLabel('Senha atual').fill('senha-errada');
  await page.locator('#new-password').fill('nova-senha-123');
  await page.getByLabel('Confirmar nova senha').fill('nova-senha-123');
  await page.getByRole('button', { name: 'Alterar senha' }).click();
  await expect(page.getByRole('alert')).toContainText('Senha atual incorreta');
  await expect(page.getByRole('dialog', { name: 'Trocar senha' })).toBeVisible();
  await expect(page).toHaveURL(/\/empresa\/a\/trips$/);
});

test('conta sem empresa ativa pode trocar a senha no celular', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { id: 'u', name: 'Usuário', email: 'u@example.test', role: 'editor', legacyAccess: false } });
    if (path === '/api/organizations') return route.fulfill({ json: { organizations: [] } });
    return route.fulfill({ status: 404, json: { error: 'Não encontrado' } });
  });
  await page.goto('/empresa');
  await expect(page.getByText('Nenhuma empresa vinculada')).toBeVisible();
  await openPasswordMenuItem(page);
  await expect(page.getByRole('dialog', { name: 'Trocar senha' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
