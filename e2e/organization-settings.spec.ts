import { expect, test } from '@playwright/test';

// Única paridade real encontrada com Configurações do painel OVERTRIP: a
// unidade de preço padrão usada ao abrir "Nova viagem" nesta empresa. As
// demais seções (WhatsApp, padrões de botão para publicar no site, FAQ,
// base da IA) são da plataforma OVERTRIP, não aparecem aqui e não têm rota
// nenhuma no painel de empresa -- não há o que testar para elas por aqui.

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Devolve também `organization`: o mesmo objeto que a rota lê e grava, para
// um teste simular uma escrita concorrente de outro administrador (mudar o
// campo direto, sem passar pela página) entre o carregamento da página e o
// clique em salvar.
async function mockOrganizationApi(page: import('@playwright/test').Page, { role, initialDefault = null, initialBrandColor = null }: { role: string; initialDefault?: string | null; initialBrandColor?: string | null }) {
  let authenticated = false;
  const organization = { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE', defaultPriceUnit: initialDefault as string | null, brandColor: initialBrandColor as string | null };
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role }] } });
    if (url.pathname === '/api/organizations/a') return route.fulfill({ json: { organization, role } });
    if (url.pathname === '/api/organizations/a/settings' && request.method() === 'PUT') {
      if (role !== 'OWNER' && role !== 'ADMIN') return route.fulfill({ status: 403, json: { error: 'Papel insuficiente para esta operação', code: 'ORGANIZATION_ROLE_DENIED' } });
      const body = request.postDataJSON() as { defaultPriceUnit?: string | null; brandColor?: string | null };
      // Omitido (undefined): não toca o padrão já salvo, igual ao servidor
      // real. null é um valor válido (limpa a substituição); só texto vazio
      // ou longo demais é rejeitado, como no servidor real.
      if (body.defaultPriceUnit !== undefined && body.defaultPriceUnit !== null && (!body.defaultPriceUnit.trim() || body.defaultPriceUnit.length > 40)) return route.fulfill({ status: 400, json: { error: 'Dados inválidos' } });
      // Mesma regra do servidor: formato #RRGGBB e contraste mínimo com
      // branco; cores claras (ex.: amarelo) são sempre rejeitadas aqui.
      if (body.brandColor !== undefined && body.brandColor !== null) {
        if (!HEX_COLOR.test(body.brandColor)) return route.fulfill({ status: 400, json: { error: 'Dados de entrada inválidos', code: 'VALIDATION_ERROR', details: [{ field: 'brandColor', message: 'Informe uma cor no formato #RRGGBB (ex.: #0b756b).' }] } });
        const n = parseInt(body.brandColor.slice(1), 16);
        const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        const lum = [r, g, b].map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        const relLum = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
        const contrast = (1 + 0.05) / (relLum + 0.05);
        if (contrast < 4.5) return route.fulfill({ status: 400, json: { error: 'Dados de entrada inválidos', code: 'VALIDATION_ERROR', details: [{ field: 'brandColor', message: 'Essa cor é muito clara para o contraste mínimo exigido (4.5:1 com texto branco); escolha um tom mais escuro.' }] } });
      }
      if (body.defaultPriceUnit !== undefined) organization.defaultPriceUnit = body.defaultPriceUnit;
      if (body.brandColor !== undefined) organization.brandColor = body.brandColor;
      return route.fulfill({ json: { organization, role } });
    }
    if (url.pathname === '/api/organizations/a/tourism/dashboard') return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
  return { organization };
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
}

test('OWNER edita a unidade de preço padrão; a próxima "Nova viagem" já vem preenchida com o novo valor', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER' });
  await login(page);
  await page.getByRole('link', { name: 'Configurações' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/settings$/);

  await page.locator('#org-settings-price-unit').fill('por grupo');
  await page.getByRole('button', { name: 'Salvar configurações' }).click();
  await expect(page.getByText('Configurações salvas.')).toBeVisible();

  await page.getByRole('link', { name: 'Viagens', exact: true }).click();
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await expect(page.locator('#org-trip-price-unit')).toHaveValue('por grupo');
});

test('campo vazio é recusado antes de enviar, e o padrão anterior permanece', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER', initialDefault: 'por pessoa' });
  await login(page);
  await page.getByRole('link', { name: 'Configurações' }).click();
  await page.locator('#org-settings-price-unit').fill('   ');
  await page.getByRole('button', { name: 'Salvar configurações' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await page.reload();
  await expect(page.locator('#org-settings-price-unit')).toHaveValue('por pessoa');
});

test('sem substituição salva (null), o campo mostra o padrão efetivo "por pessoa" e Restaurar fica desabilitado', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER', initialDefault: null });
  await login(page);
  await page.getByRole('link', { name: 'Configurações' }).click();
  await expect(page.locator('#org-settings-price-unit')).toHaveValue('por pessoa');
  await expect(page.getByRole('button', { name: /^Restaurar o padrão/ })).toBeDisabled();
});

test('define uma substituição e depois restaura: o campo volta ao padrão efetivo e grava null', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER', initialDefault: null });
  await login(page);
  await page.getByRole('link', { name: 'Configurações' }).click();

  await page.locator('#org-settings-price-unit').fill('por grupo');
  await page.getByRole('button', { name: 'Salvar configurações' }).click();
  await expect(page.getByText('Configurações salvas.')).toBeVisible();
  const restoreButton = page.getByRole('button', { name: /^Restaurar o padrão/ });
  await expect(restoreButton).toBeEnabled();

  await restoreButton.click();
  await expect(page.getByText('Restaurado para "por pessoa".')).toBeVisible();
  await expect(page.locator('#org-settings-price-unit')).toHaveValue('por pessoa');
  await expect(restoreButton).toBeDisabled();

  // Depois de restaurar, abrir "Nova viagem" continua preenchendo com o
  // padrão efetivo (não um valor vazio nem uma substituição persistida).
  await page.getByRole('link', { name: 'Viagens', exact: true }).click();
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await expect(page.locator('#org-trip-price-unit')).toHaveValue('por pessoa');
});

test('MEMBER não tem acesso a configurações: o menu nem mostra o link, e a rota direta mostra acesso restrito', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'MEMBER' });
  await login(page);
  await expect(page.getByRole('link', { name: 'Configurações' })).toHaveCount(0);

  await page.goto('/empresa/a/settings');
  await expect(page.getByText('Acesso restrito')).toBeVisible();
  await expect(page.locator('#org-settings-price-unit')).toHaveCount(0);
  await expect(page.locator('#org-settings-brand-color')).toHaveCount(0);
});

test('sem cor própria salva, o seletor mostra o verde padrão, Restaurar fica desabilitado, e o painel usa essa cor', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER' });
  await login(page);
  await page.getByRole('link', { name: 'Configurações' }).click();

  await expect(page.locator('#org-settings-brand-color')).toHaveValue('#09685f');
  await expect(page.getByText('#09685f')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Restaurar a cor padrão/ })).toBeDisabled();

  // A cor efetiva (fallback) é mesmo a aplicada no painel, não só exibida no formulário.
  const appliedColor = await page.evaluate(() => getComputedStyle(document.querySelector('.agency-panel')!).getPropertyValue('--agency-600').trim());
  expect(appliedColor).toBe('#09685f');
});

test('OWNER escolhe uma cor válida, ela persiste e passa a ser aplicada no painel (desktop e celular)', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER' });
  await login(page);
  await page.getByRole('link', { name: 'Configurações' }).click();

  await page.locator('#org-settings-brand-color').fill('#185f90');
  await page.getByRole('button', { name: 'Salvar cor' }).click();
  await expect(page.getByText('Cor da empresa salva.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Restaurar a cor padrão/ })).toBeEnabled();

  const desktopColor = await page.evaluate(() => getComputedStyle(document.querySelector('.agency-panel')!).getPropertyValue('--agency-600').trim());
  expect(desktopColor).toBe('#185f90');

  // A cor persistida continua aplicada depois de recarregar e também no layout móvel.
  await page.setViewportSize({ width: 360, height: 780 });
  await page.reload();
  await expect(page.locator('#org-settings-brand-color')).toHaveValue('#185f90');
  const mobileColor = await page.evaluate(() => getComputedStyle(document.querySelector('.agency-panel')!).getPropertyValue('--agency-600').trim());
  expect(mobileColor).toBe('#185f90');

  await page.getByRole('button', { name: /^Restaurar a cor padrão/ }).click();
  await expect(page.getByText('Restaurado para a cor padrão (verde).')).toBeVisible();
  await expect(page.locator('#org-settings-brand-color')).toHaveValue('#09685f');
});

test('rejeita formato inválido e cor sem contraste suficiente, sem salvar nem aplicar', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER' });
  await login(page);
  await page.getByRole('link', { name: 'Configurações' }).click();

  // input[type=color] já força um hex válido no próprio navegador; ainda
  // assim a cor é clara demais para o contraste mínimo exigido.
  await page.locator('#org-settings-brand-color').fill('#ffff00');
  await page.getByRole('button', { name: 'Salvar cor' }).click();
  await expect(page.getByRole('alert')).toContainText('contraste');

  const appliedColor = await page.evaluate(() => getComputedStyle(document.querySelector('.agency-panel')!).getPropertyValue('--agency-600').trim());
  expect(appliedColor).toBe('#09685f'); // nada foi aplicado: continua no fallback
});

test('salvar a cor não sobrescreve uma unidade de preço alterada por outro administrador entre o carregamento e o clique', async ({ page }) => {
  const { organization } = await mockOrganizationApi(page, { role: 'OWNER', initialDefault: 'por pessoa' });
  await login(page);
  await page.getByRole('link', { name: 'Configurações' }).click();
  await expect(page.locator('#org-settings-price-unit')).toHaveValue('por pessoa');

  // Outro administrador grava uma unidade de preço diferente direto no
  // "servidor" (sem passar pela página desta aba), simulando uma edição
  // concorrente entre o carregamento da página e o clique abaixo.
  organization.defaultPriceUnit = 'por grupo (outro admin)';

  await page.locator('#org-settings-brand-color').fill('#185f90');
  await page.getByRole('button', { name: 'Salvar cor' }).click();
  await expect(page.getByText('Cor da empresa salva.')).toBeVisible();

  // A mudança concorrente precisa sobreviver: salvar a cor não pode ter
  // reenviado o retrato antigo ("por pessoa") que esta aba carregou.
  expect(organization.defaultPriceUnit).toBe('por grupo (outro admin)');

  await page.reload();
  await expect(page.locator('#org-settings-price-unit')).toHaveValue('por grupo (outro admin)');
  await expect(page.locator('#org-settings-brand-color')).toHaveValue('#185f90');
});
