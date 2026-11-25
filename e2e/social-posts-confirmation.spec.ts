import { expect, test } from '@playwright/test';

test('confirmação acessível de descarte preserva ou fecha o editor conforme a escolha', async ({ page }) => {
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    if (new URL(route.request().url()).pathname === '/api/auth/me') {
      return route.fulfill({ json: { id: 'admin', name: 'Admin', email: 'admin@example.test', role: 'admin', legacyAccess: true } });
    }
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });

  await page.goto('/social-posts');
  await page.getByRole('button', { name: 'Novo post' }).click();
  const editor = page.getByRole('dialog', { name: 'Novo post' });
  await editor.getByLabel('Título interno').fill('Rascunho em andamento');
  await editor.getByRole('button', { name: 'Cancelar' }).click();

  const confirmation = page.getByRole('dialog', { name: 'Descartar alterações?' });
  await expect(confirmation).toHaveAccessibleDescription('As alterações que ainda não foram salvas serão perdidas.');
  await confirmation.getByRole('button', { name: 'Cancelar' }).click();
  await expect(editor.getByLabel('Título interno')).toHaveValue('Rascunho em andamento');

  await editor.getByRole('button', { name: 'Cancelar' }).click();
  await confirmation.getByRole('button', { name: 'Descartar alterações' }).click();
  await expect(editor).toHaveCount(0);
  await expect(confirmation).toHaveCount(0);
});
