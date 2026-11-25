import { expect, test } from '@playwright/test';

// Fechar o formulário de viagem da empresa (Cancelar, X, Esc ou clique fora)
// com algo digitado e não salvo agora pergunta antes de descartar — mesmo
// padrão de confirmação já usado em TripForm.tsx (legado) e em
// OrganizationPassword.tsx, reaproveitado via ConfirmDialog (Radix: foco
// preso, Esc fecha o próprio diálogo, botões operáveis por teclado).

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };

function mockOrganizationApi(page: import('@playwright/test').Page, onCreate?: (body: unknown) => unknown) {
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
        const body = request.postDataJSON();
        const result = onCreate(body);
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

async function fillEssentials(page: import('@playwright/test').Page) {
  await page.locator('#org-trip-title').fill('Trilha do Pico');
  await page.locator('#org-trip-category').fill('Trilha');
  await page.locator('#org-trip-city').fill('Areia');
  await page.locator('#org-trip-region').fill('PB');
  await page.locator('#org-trip-start').fill('2030-08-01T06:00');
  await page.locator('#org-trip-description').fill('Caminhada guiada com paradas para observação.');
}

test('formulário sem alterações fecha direto ao cancelar, sem perguntar', async ({ page }) => {
  await mockOrganizationApi(page);
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Descartar alterações?' })).toHaveCount(0);
});

test('cancelar com alterações pergunta antes; descartar fecha e limpa o formulário', async ({ page }) => {
  await mockOrganizationApi(page);
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await page.locator('#org-trip-title').fill('Rascunho esquecido');

  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { name: 'Descartar alterações?' })).toBeVisible();
  // O formulário continua por trás, com o texto ainda ali, até a escolha.
  await expect(page.locator('#org-trip-title')).toHaveValue('Rascunho esquecido');

  await page.getByRole('button', { name: 'Descartar alterações' }).click();
  await expect(page.getByRole('heading', { name: 'Descartar alterações?' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toHaveCount(0);

  // Reabrir confirma que o estado foi mesmo limpo, não só escondido.
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await expect(page.locator('#org-trip-title')).toHaveValue('');
});

test('cancelar com alterações, mas escolher não descartar mantém o formulário aberto com o texto', async ({ page }) => {
  await mockOrganizationApi(page);
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await page.locator('#org-trip-title').fill('Não perder isto');

  await page.getByRole('button', { name: 'Cancelar' }).click();
  const confirmDialog = page.getByRole('heading', { name: 'Descartar alterações?' });
  await expect(confirmDialog).toBeVisible();

  // O "Cancelar" aqui é o do próprio ConfirmDialog (desistir de descartar).
  await page.getByRole('dialog', { name: 'Descartar alterações?' }).getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirmDialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toBeVisible();
  await expect(page.locator('#org-trip-title')).toHaveValue('Não perder isto');
});

test('tecla Esc com alterações pergunta antes de descartar, e os botões da confirmação são operáveis pelo teclado', async ({ page }) => {
  await mockOrganizationApi(page);
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await page.locator('#org-trip-title').fill('Protegido do Esc');

  await page.keyboard.press('Escape');
  const confirmDialog = page.getByRole('heading', { name: 'Descartar alterações?' });
  await expect(confirmDialog).toBeVisible();

  // Radix move o foco para dentro do diálogo que abriu: o primeiro botão
  // ("Cancelar", desistir de descartar) já fica focado, operável por Enter.
  await expect(page.getByRole('dialog', { name: 'Descartar alterações?' }).getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(confirmDialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toBeVisible();
  await expect(page.locator('#org-trip-title')).toHaveValue('Protegido do Esc');

  // De novo via Esc; agora navega por Tab até "Descartar alterações" e confirma com Enter.
  await page.keyboard.press('Escape');
  await expect(confirmDialog).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Descartar alterações' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toHaveCount(0);
});

test('texto ainda não confirmado em uma lista também conta como alteração ao cancelar', async ({ page }) => {
  await mockOrganizationApi(page);
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  // Digita mas nunca confirma (nem Enter, nem o botão Adicionar).
  await page.locator('#org-trip-includes').fill('Transporte incluso');

  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { name: 'Descartar alterações?' })).toBeVisible();
});

test('salvar não aciona o aviso de descarte', async ({ page }) => {
  let created: Record<string, unknown> | null = null;
  await mockOrganizationApi(page, (body) => {
    created = body as Record<string, unknown>;
    return { id: 'trip-1', title: (body as { title: string }).title, category: (body as { category: string }).category, description: (body as { description: string }).description, city: (body as { city: string }).city, region: (body as { region: string }).region, startDateISO: (body as { startDateISO: string }).startDateISO, endDateISO: null, status: 'DRAFT', updatedAt: '2030-01-01T00:00:00.000Z' };
  });
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await fillEssentials(page);
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Descartar alterações?' })).toHaveCount(0);
  expect(created).not.toBeNull();
});
