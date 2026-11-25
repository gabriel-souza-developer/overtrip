import { expect, test, type Page } from '@playwright/test';

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'editor', legacyAccess: false };
type Resource = 'visits' | 'gallery';
function mockApi(page: Page, resource: Resource, role: 'OWNER' | 'MEMBER', opts: { error?: boolean; canEdit?: boolean } = {}) {
  let authenticated = false;
  let exists = true;
  const item = resource === 'visits'
    ? { id: 'v1', title: 'Destino teste', city: 'Areia', region: 'PB', description: '', date: null, lat: null, lng: null, needsReview: false, images: [], canEdit: opts.canEdit ?? true }
    : { id: 'g1', title: 'Memória teste', date: '2030-01-01T00:00:00.000Z', dateDisplay: '2030', description: 'Uma memória', images: [], isFeatured: false, canEdit: opts.canEdit ?? true };
  return page.route(url => url.pathname.startsWith('/api/'), async route => {
    const request = route.request(); const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role }] } });
    if (pathname === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE', defaultPriceUnit: null, brandColor: null }, role } });
    if (pathname === '/api/organizations/a/tourism/dashboard') return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    if (pathname === `/api/organizations/a/tourism/${resource}` && request.method() === 'GET') return route.fulfill({ json: { data: exists ? [item] : [], pagination: { page: 1, limit: 20, total: exists ? 1 : 0, totalPages: 1 } } });
    if (pathname === `/api/organizations/a/tourism/${resource}/${item.id}` && request.method() === 'DELETE') {
      if (opts.error) return route.fulfill({ status: 409, json: { error: 'Existem registros vinculados.' } });
      exists = false; return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
}
async function login(page: Page, resource: Resource) {
  await page.goto('/login'); await page.getByLabel('E-mail').fill(user.email); await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click(); await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  await page.getByRole('link', { name: resource === 'visits' ? 'Destinos visitados' : 'Galeria de memórias', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/empresa/a/${resource}$`));
}
for (const resource of ['visits', 'gallery'] as const) {
  const name = resource === 'visits' ? 'Destino teste' : 'Memória teste';
  const heading = resource === 'visits' ? 'Excluir este destino?' : 'Excluir esta memória?';
  test(`${resource}: cancela e depois confirma exclusão`, async ({ page }) => {
    await mockApi(page, resource, 'OWNER'); await login(page, resource);
    await page.getByRole('button', { name: `Excluir ${name}` }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click(); await expect(page.getByText(name)).toBeVisible();
    await page.getByRole('button', { name: `Excluir ${name}` }).click(); await page.getByRole('button', { name: 'Sim, excluir' }).click();
    await expect(page.getByText(name)).toHaveCount(0);
  });
  test(`${resource}: MEMBER e acervo não editável não oferecem exclusão`, async ({ page }) => {
    await mockApi(page, resource, 'MEMBER'); await login(page, resource);
    await expect(page.getByText(name)).toBeVisible(); await expect(page.getByRole('button', { name: `Excluir ${name}` })).toHaveCount(0);
  });
  test(`${resource}: OWNER não pode excluir item importado não editável`, async ({ page }) => {
    await mockApi(page, resource, 'OWNER', { canEdit: false }); await login(page, resource);
    await expect(page.getByText(name)).toBeVisible(); await expect(page.getByRole('button', { name: `Excluir ${name}` })).toHaveCount(0);
  });
  test(`${resource}: erro do servidor mantém confirmação e registro`, async ({ page }) => {
    await mockApi(page, resource, 'OWNER', { error: true }); await login(page, resource);
    await page.getByRole('button', { name: `Excluir ${name}` }).click(); await page.getByRole('button', { name: 'Sim, excluir' }).click();
    await expect(page.getByText('Existem registros vinculados.')).toBeVisible(); await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText(name)).toBeVisible();
  });
  test(`${resource}: confirmação é acessível no celular`, async ({ page }) => {
    await mockApi(page, resource, 'OWNER'); await login(page, resource); await page.setViewportSize({ width: 360, height: 780 });
    await page.getByRole('button', { name: `Excluir ${name}` }).click(); await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await page.getByRole('button', { name: 'Sim, excluir' }).click(); await expect(page.getByText(name)).toHaveCount(0);
  });
}
