import { expect, test } from '@playwright/test';

// Lacuna identificada comparando o painel da empresa com o operador legado:
// viagens podiam ser criadas e editadas pela própria empresa, mas nunca
// excluídas. Cobre o botão "Excluir" (só para OWNER/ADMIN, só em rascunho),
// a confirmação antes de excluir de vez, o bloqueio quando o servidor
// recusa (reserva/interessado/visita/memória associada) e o funcionamento
// em telas estreitas (celular), igual aos demais testes de viagem do painel.

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };

type MockTrip = { id: string; title: string; category: string; description: string; city: string; region: string; startDateISO: string; endDateISO: string | null; status: string; updatedAt: string };

function makeTrip(id: string, title: string): MockTrip {
  return { id, title, category: 'Trilha', description: 'Caminhada guiada', city: 'Areia', region: 'PB', startDateISO: '2030-08-01T09:00:00.000Z', endDateISO: null, status: 'DRAFT', updatedAt: new Date().toISOString() };
}

function mockOrganizationApi(page: import('@playwright/test').Page, { role = 'OWNER', trips = [] as MockTrip[], deleteStatus, deleteBody }: { role?: string; trips?: MockTrip[]; deleteStatus?: number; deleteBody?: unknown } = {}) {
  let authenticated = false;
  const list = [...trips];
  return page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role }] } });
    if (url.pathname === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE', defaultPriceUnit: null, brandColor: null }, role } });
    if (url.pathname === '/api/organizations/a/tourism/dashboard') return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    if (url.pathname === '/api/organizations/a/tourism/trips') {
      if (request.method() === 'GET') return route.fulfill({ json: { data: list, pagination: { page: 1, limit: 20, total: list.length, totalPages: 1 } } });
    }
    const deleteMatch = url.pathname.match(/^\/api\/organizations\/a\/tourism\/trips\/([^/]+)$/);
    if (deleteMatch && request.method() === 'DELETE') {
      const id = deleteMatch[1];
      if (role !== 'OWNER' && role !== 'ADMIN') return route.fulfill({ status: 403, json: { error: 'Papel insuficiente para esta operação', code: 'ORGANIZATION_ROLE_DENIED' } });
      if (deleteStatus && deleteStatus !== 204) return route.fulfill({ status: deleteStatus, json: deleteBody ?? { error: 'Não foi possível excluir.' } });
      const index = list.findIndex((trip) => trip.id === id);
      if (index === -1) return route.fulfill({ status: 404, json: { error: 'Viagem não encontrada' } });
      list.splice(index, 1);
      return route.fulfill({ status: 204, body: '' });
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

test('OWNER exclui uma viagem sem vínculos: confirma, some da lista e mostra aviso de sucesso implícito (lista vazia)', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER', trips: [makeTrip('t1', 'Trilha do Pico')] });
  await login(page);
  await expect(page.getByText('Trilha do Pico')).toBeVisible();

  await page.getByRole('button', { name: 'Excluir Trilha do Pico' }).click();
  await expect(page.getByRole('heading', { name: 'Excluir esta viagem?' })).toBeVisible();
  await expect(page.getByText('será apagada de vez')).toBeVisible();

  await page.getByRole('button', { name: 'Sim, excluir' }).click();
  await expect(page.getByRole('heading', { name: 'Excluir esta viagem?' })).toHaveCount(0);
  await expect(page.getByText('Trilha do Pico')).toHaveCount(0);
  await expect(page.getByText('Nenhuma viagem cadastrada')).toBeVisible();
});

test('cancelar a confirmação não exclui nada', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER', trips: [makeTrip('t1', 'Trilha do Pico')] });
  await login(page);
  await page.getByRole('button', { name: 'Excluir Trilha do Pico' }).click();
  await expect(page.getByRole('heading', { name: 'Excluir esta viagem?' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { name: 'Excluir esta viagem?' })).toHaveCount(0);
  await expect(page.getByText('Trilha do Pico')).toBeVisible();
});

test('servidor recusa por reserva/interessado associado: o diálogo mostra o motivo e a viagem continua na lista', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER', trips: [makeTrip('t1', 'Trilha do Pico')], deleteStatus: 409, deleteBody: { error: 'Não é possível excluir viagem com reservas ou interessados associados.' } });
  await login(page);
  await page.getByRole('button', { name: 'Excluir Trilha do Pico' }).click();
  await page.getByRole('button', { name: 'Sim, excluir' }).click();

  await expect(page.getByText('Não é possível excluir viagem com reservas ou interessados associados.')).toBeVisible();
  // O diálogo continua aberto (não fechou com o erro) e a viagem não saiu da lista por trás dele.
  await expect(page.getByRole('heading', { name: 'Excluir esta viagem?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByText('Trilha do Pico')).toBeVisible();
});

test('MEMBER não vê os botões Editar/Excluir (consulta só leitura)', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'MEMBER', trips: [makeTrip('t1', 'Trilha do Pico')] });
  await login(page);
  await expect(page.getByText('Trilha do Pico')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Excluir Trilha do Pico' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar Trilha do Pico' })).toHaveCount(0);
});

test('funciona em tela de celular: botão, confirmação e exclusão continuam acessíveis', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER', trips: [makeTrip('t1', 'Trilha do Pico')] });
  await login(page);
  // Redimensiona só depois de entrar: a navegação lateral some atrás de um
  // botão "Abrir menu" em telas estreitas, igual aos demais testes móveis
  // do painel (ver organization-settings.spec.ts).
  await page.setViewportSize({ width: 360, height: 780 });
  await page.reload();
  await expect(page.getByText('Trilha do Pico')).toBeVisible();

  await page.getByRole('button', { name: 'Excluir Trilha do Pico' }).click();
  await expect(page.getByRole('heading', { name: 'Excluir esta viagem?' })).toBeVisible();
  await page.getByRole('button', { name: 'Sim, excluir' }).click();
  await expect(page.getByText('Nenhuma viagem cadastrada')).toBeVisible();
});
