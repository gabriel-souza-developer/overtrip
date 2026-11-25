import { expect, test, type Page } from '@playwright/test';

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'editor', legacyAccess: false };
const organizations = [
  { id: 'a', name: 'Agência A', slug: 'a', role: 'OWNER' },
  { id: 'b', name: 'Agência B', slug: 'b', role: 'ADMIN' },
];

async function setup(page: Page, selected: typeof organizations, fail = false) {
  let authenticated = false;
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (path === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (path === '/api/auth/logout') { authenticated = false; return route.fulfill({ status: 204 }); }
    if (path === '/api/organizations') return fail ? route.fulfill({ status: 500, json: { error: 'Falha ao carregar empresas' } }) : route.fulfill({ json: { organizations: selected } });
    if (path === '/api/organizations/a') return route.fulfill({ json: { organization: { ...organizations[0], status: 'ACTIVE' }, role: 'OWNER' } });
    if (path === '/api/organizations/a/tourism/dashboard') return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function logoutFromAccountMenu(page: Page) {
  await page.getByRole('button', { name: 'Minha conta' }).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
}

test('uma empresa abre automaticamente, mas trocar empresa não redireciona em ciclo', async ({ page }) => {
  await setup(page, organizations.slice(0, 1));
  await login(page);
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  await page.getByRole('link', { name: 'Trocar empresa' }).click();
  await expect(page).toHaveURL(/\/empresa$/);
  await expect(page.getByRole('button', { name: /Agência A/ })).toBeVisible();
  await logoutFromAccountMenu(page);
  await expect(page).toHaveURL(/\/login$/);
  await login(page);
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
});

test('múltiplas empresas continuam exigindo escolha', async ({ page }) => {
  await setup(page, organizations);
  await login(page);
  await expect(page).toHaveURL(/\/empresa$/);
  await expect(page.getByRole('button', { name: /Agência A/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Agência B/ })).toBeVisible();
});

test('conta sem empresa mantém estado vazio e saída disponível', async ({ page }) => {
  await setup(page, []);
  await login(page);
  await expect(page.getByText('Nenhuma empresa vinculada')).toBeVisible();
  await logoutFromAccountMenu(page);
  await expect(page).toHaveURL(/\/login$/);
});

test('erro ao carregar empresas mostra mensagem e permite sair', async ({ page }) => {
  await setup(page, [], true);
  await login(page);
  await expect(page.getByText('Falha ao carregar empresas')).toBeVisible();
  await logoutFromAccountMenu(page);
  await expect(page).toHaveURL(/\/login$/);
});
