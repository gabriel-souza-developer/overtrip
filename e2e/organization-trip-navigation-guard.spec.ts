import { expect, test } from '@playwright/test';

// beforeunload (já existente) só cobre fechar a aba ou recarregar. O botão
// Voltar/Avançar do navegador é navegação de histórico dentro do mesmo SPA:
// não aciona beforeunload, e ficava sem aviso -- essa era a limitação
// relatada no formulário de viagem. Os outros caminhos de "navegação
// interna" (menu lateral, trocar empresa, sair) já ficam fora de alcance
// enquanto este modal está aberto: o Radix aplica aria-hidden ao resto da
// página e o overlay cobre tudo visualmente, então não há nada a interceptar
// ali -- confirmado em investigação manual (não há teste automatizado disso
// por não haver comportamento a cobrir). Esta suíte cobre só o botão Voltar,
// reaproveitando o ConfirmDialog de descarte já existente no formulário.

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };

function mockOrganizationApi(page: import('@playwright/test').Page, { onCreate }: { onCreate?: (body: unknown) => unknown } = {}) {
  let authenticated = false;
  const trips: unknown[] = [];
  return page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role: 'OWNER' }] } });
    if (url.pathname === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE' }, role: 'OWNER' } });
    if (url.pathname === '/api/organizations/a/tourism/dashboard') return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    if (url.pathname === '/api/organizations/a/tourism/trips') {
      if (request.method() === 'GET') return route.fulfill({ json: { data: trips, pagination: { page: 1, limit: 20, total: trips.length, totalPages: 1 } } });
      if (request.method() === 'POST' && onCreate) {
        const result = onCreate(request.postDataJSON());
        trips.push(result);
        return route.fulfill({ status: 201, json: result });
      }
    }
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  await page.getByRole('link', { name: 'Viagens', exact: true }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/trips$/);
}

async function openDirtyForm(page: import('@playwright/test').Page, title = 'Rascunho não salvo') {
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await page.locator('#org-trip-title').fill(title);
}

test('botão Voltar com o formulário sujo pergunta antes de sair; cancelar preserva o rascunho', async ({ page }) => {
  await mockOrganizationApi(page);
  await login(page);
  await openDirtyForm(page);

  await page.goBack();
  const confirmation = page.getByRole('dialog', { name: 'Descartar alterações?' });
  await expect(confirmation).toBeVisible();
  await expect(page).toHaveURL(/\/empresa\/a\/trips$/);

  await confirmation.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toBeVisible();
  await expect(page.locator('#org-trip-title')).toHaveValue('Rascunho não salvo');
  await expect(page).toHaveURL(/\/empresa\/a\/trips$/);
});

test('confirmar o descarte no aviso do botão Voltar completa a navegação e limpa o formulário', async ({ page }) => {
  await mockOrganizationApi(page);
  await login(page);
  await openDirtyForm(page);

  await page.goBack();
  await page.getByRole('dialog', { name: 'Descartar alterações?' }).getByRole('button', { name: 'Descartar alterações' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);

  await page.goForward();
  await expect(page).toHaveURL(/\/empresa\/a\/trips$/);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await expect(page.locator('#org-trip-title')).toHaveValue('');
});

test('cancelar o aviso do botão Voltar continua bloqueando tentativas seguintes', async ({ page }) => {
  await mockOrganizationApi(page);
  await login(page);
  await openDirtyForm(page);

  await page.goBack();
  await page.getByRole('dialog', { name: 'Descartar alterações?' }).getByRole('button', { name: 'Cancelar' }).click();

  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Descartar alterações?' })).toBeVisible();
  await expect(page).toHaveURL(/\/empresa\/a\/trips$/);
});

test('teclado: Tab alcança os dois botões do aviso do botão Voltar, e Enter os ativa', async ({ page }) => {
  await mockOrganizationApi(page);
  await login(page);
  await openDirtyForm(page);

  await page.goBack();
  const confirmation = page.getByRole('dialog', { name: 'Descartar alterações?' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(confirmation).toHaveCount(0);
  await expect(page).toHaveURL(/\/empresa\/a\/trips$/);

  await page.goBack();
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(confirmation.getByRole('button', { name: 'Descartar alterações' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
});

test('sem edições pendentes, o botão Voltar navega direto, sem perguntar', async ({ page }) => {
  await mockOrganizationApi(page);
  await login(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  await expect(page.getByRole('dialog', { name: 'Descartar alterações?' })).toHaveCount(0);
});

test('salvar não deixa pendência: depois de salvar, o botão Voltar não pergunta', async ({ page }) => {
  await mockOrganizationApi(page, {
    onCreate: (body) => ({ id: 'trip-1', ...(body as Record<string, unknown>), endDateISO: null, status: 'DRAFT', updatedAt: '2030-01-01T00:00:00.000Z' }),
  });
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await page.locator('#org-trip-title').fill('Trilha do Pico');
  await page.locator('#org-trip-category').fill('Trilha');
  await page.locator('#org-trip-city').fill('Areia');
  await page.locator('#org-trip-region').fill('PB');
  await page.locator('#org-trip-start').fill('2030-08-01T06:00');
  await page.locator('#org-trip-description').fill('Caminhada guiada com paradas para observação.');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  await expect(page.getByRole('dialog', { name: 'Descartar alterações?' })).toHaveCount(0);
});

test('cancelar o formulário sem alterações (botão Cancelar) não deixa pendência residual para o botão Voltar', async ({ page }) => {
  await mockOrganizationApi(page);
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  await expect(page.getByRole('dialog', { name: 'Descartar alterações?' })).toHaveCount(0);
});
