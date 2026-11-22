import { expect, test } from '@playwright/test';

// Cobre a reutilização de SocialPosts.tsx no painel de empresa: mesma
// interface da rota legada, mas falando com as rotas por empresa
// (/organizations/:id/tourism/social-posts e .../social-media), com
// OWNER criando/aprovando. Redes sociais é informação de divulgação
// sensível, no mesmo grupo de Interessados e Reservas: MEMBER não tem
// acesso nenhum (nem leitura), nem pelo menu nem pela rota direta,
// mesma convenção de organization-lead-create.spec.ts. A API é simulada
// com a mesma convenção de organization-trip-create.spec.ts.

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };

function mockOrganizationApi(page: import('@playwright/test').Page, { role, posts }: { role: string; posts: Array<Record<string, unknown>> }) {
  let authenticated = false;
  return page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role }] } });
    if (url.pathname === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE' }, role } });
    if (url.pathname === '/api/organizations/a/tourism/social-posts') {
      if (role !== 'OWNER' && role !== 'ADMIN') return route.fulfill({ status: 403, json: { error: 'Papel insuficiente para esta operação', code: 'ORGANIZATION_ROLE_DENIED' } });
      if (request.method() === 'GET') return route.fulfill({ json: { data: posts, pagination: { page: 1, limit: 20, total: posts.length, totalPages: 1 } } });
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as { title: string; variants: Array<{ platform: string; caption: string; socialMediaId?: string | null }> };
        const created = { id: 'post-1', title: body.title, variants: body.variants, approvedAt: null, version: 1, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z' };
        posts.push(created);
        return route.fulfill({ status: 201, json: created });
      }
    }
    if (url.pathname === '/api/organizations/a/tourism/social-posts/post-1/approve' && request.method() === 'POST') {
      const post = posts.find((item) => item.id === 'post-1');
      if (post) { post.approvedAt = '2030-01-02T00:00:00.000Z'; post.version = (post.version as number) + 1; }
      return route.fulfill({ json: post });
    }
    if (url.pathname === '/api/organizations/a/tourism/dashboard') return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
}

test('OWNER cria um rascunho social pelo painel de empresa reaproveitando a mesma tela', async ({ page }) => {
  const posts: Array<Record<string, unknown>> = [];
  await mockOrganizationApi(page, { role: 'OWNER', posts });
  await login(page);
  await page.getByRole('link', { name: 'Redes sociais' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/social-posts$/);
  await expect(page.getByRole('heading', { name: 'Redes sociais', exact: true })).toBeVisible();

  // Sugestão de legenda por IA fica indisponível no modo organização —
  // não é um menu incompleto, é uma limitação explicada na própria tela.
  await page.getByRole('button', { name: 'Novo post' }).click();
  await expect(page.getByText('Sugestão de legenda por IA ainda não está disponível para contas de empresa.').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sugerir legenda' })).toHaveCount(0);

  await page.locator('#social-title').fill('Promoção de verão');
  await page.locator('#caption-INSTAGRAM').fill('Vem pro verão com a gente!');
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(page.getByText('Promoção de verão')).toBeVisible();

  await page.getByRole('button', { name: 'Abrir e revisar' }).click();
  await page.getByRole('button', { name: 'Marcar versão salva como revisada' }).click();
  // Locator restrito ao card do post: a tela sempre tem um texto de ajuda
  // fixo que também contém a palavra "revisado" ("...marcá-lo como
  // revisado."), então getByText('Revisado') sem escopo é ambíguo (ver
  // SocialPosts.tsx) e falhava por violação de modo estrito de forma
  // intermitente, só quando a lista já tinha atualizado a tempo.
  const postCard = page.locator('article').filter({ hasText: 'Promoção de verão' });
  await expect(postCard.getByText('Revisado · Instagram', { exact: true })).toBeVisible();
});

test('MEMBER não tem acesso a redes sociais: o menu nem mostra o link, e a rota direta mostra acesso restrito, sem botões nem rascunhos', async ({ page }) => {
  const posts = [{ id: 'post-1', title: 'Rascunho existente', variants: [{ platform: 'FACEBOOK', caption: 'Olá', socialMediaId: null }], approvedAt: null, version: 1, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z' }];
  await mockOrganizationApi(page, { role: 'MEMBER', posts });
  await login(page);
  // MEMBER não vê o item "Redes sociais" no menu da empresa.
  await expect(page.getByRole('link', { name: 'Redes sociais' })).toHaveCount(0);

  await page.goto('/empresa/a/social-posts');
  await expect(page.getByText('Acesso restrito')).toBeVisible();
  await expect(page.getByText('Rascunho existente')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Novo post' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abrir e revisar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Excluir' })).toHaveCount(0);
});
