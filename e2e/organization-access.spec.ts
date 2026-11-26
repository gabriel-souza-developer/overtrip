import { expect, test } from '@playwright/test';

test('login de agência abre apenas a empresa vinculada e oculta dados após erro', async ({ page }) => {
  const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };
  let authenticated = false;
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role: 'OWNER' }] } });
    if (url.pathname === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE' }, role: 'OWNER' } });
    if (url.pathname === '/api/organizations/a/tourism/leads') {
      if (url.searchParams.get('page') === '2') return route.fulfill({ status: 403, json: { error: 'Acesso revogado' } });
      return route.fulfill({ json: { data: [{ id: 'lead', name: 'Cliente privado', phone: null, email: null, stage: 'NEW', responsible: null, nextFollowUpAt: null }], pagination: { page: 1, limit: 20, total: 21, totalPages: 2 } } });
    }
    if (url.pathname === '/api/organizations/a/tourism/dashboard') return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  // A aba Interessados está oculta do menu; a rota continua acessível.
  await page.goto('/empresa/a/leads');
  await expect(page.getByText('Cliente privado')).toBeVisible();
  await page.getByRole('button', { name: 'Próxima página' }).click();
  await expect(page.getByText('Cliente privado')).toHaveCount(0);
  await expect(page.getByText('Acesso revogado')).toBeVisible();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
});
