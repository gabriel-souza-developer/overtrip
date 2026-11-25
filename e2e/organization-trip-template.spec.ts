import { expect, test } from '@playwright/test';

// "Usar como modelo" (OrganizationTrips.tsx): abre um rascunho NOVO a partir
// de uma viagem própria (qualquer situação, inclusive já publicada), nunca
// salva sozinho, nunca chama updateTrip (sempre cria), limpa data/horário/
// vagas/embarques antigos antes de preencher a tela, e preserva o mesmo
// aviso de descarte das demais edições do formulário (ver
// organization-trip-discard-confirmation.spec.ts).

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };
// Já publicada e concluída: o próprio motivo do recurso é reaproveitar uma
// viagem que já rodou, não só um rascunho — por isso nem Editar nem Excluir
// aparecem para ela, mas "Usar como modelo" deve.
const openTrip = {
  id: 'trip-1', title: 'Trilha do Pico (já rodada)', category: 'Trilha', description: 'Caminhada guiada com paradas para observação.',
  city: 'Areia', region: 'PB', updatedAt: '2024-07-01T00:00:00.000Z',
  startDateISO: '2024-07-01T09:00:00.000Z', endDateISO: '2024-07-01T18:00:00.000Z', status: 'COMPLETED',
};
const openTripDetail = {
  ...openTrip,
  headlineDisplay: 'Edição de julho', filterCategory: 'Trilha',
  departureTime: '06h00', departureTolerance: '15 minutos', returnTime: '18h00', scheduleInfo: '1º de julho', scheduleTBD: false,
  priceValue: 109.9, priceDisplay: null, priceUnit: 'por pessoa', free: false,
  intensityClass: 'intenso', spotsLeft: 3, trailDistance: '6 km', supportPoint: null, supportPointInfo: null,
  meetingCity: 'Areia', meetingPoint: 'Praça central', meetingTBD: false, meetingDetails: null, meetingMapsQuery: null,
  includes: ['Transporte', 'Guia credenciado'], includesHighlight: null, itinerary: ['06h00 - Saída'], routeNotes: [], importantInfo: [],
  media: [], departures: [{ id: 'dep-1', time: '06h00', place: 'Shopping', city: 'Campina Grande', mapsUrl: null, mapsQuery: null, orderIndex: 0 }],
};

function mockOrganizationApi(page: import('@playwright/test').Page, { role, onCreate }: { role: string; onCreate?: (body: unknown) => unknown }) {
  let authenticated = false;
  const trips: (typeof openTrip)[] = [openTrip];
  return page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role }] } });
    if (url.pathname === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE' }, role } });
    if (url.pathname === '/api/organizations/a/tourism/dashboard') return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    if (url.pathname === '/api/organizations/a/tourism/trips') {
      if (request.method() === 'GET') return route.fulfill({ json: { data: trips, pagination: { page: 1, limit: 20, total: trips.length, totalPages: 1 } } });
      if (request.method() === 'POST') {
        if (!onCreate) return route.fulfill({ status: 403, json: { error: 'Papel insuficiente para esta operação', code: 'ORGANIZATION_ROLE_DENIED' } });
        const result = onCreate(request.postDataJSON());
        trips.push(result as typeof openTrip);
        return route.fulfill({ status: 201, json: result });
      }
    }
    if (url.pathname === '/api/organizations/a/tourism/trips/trip-1' && request.method() === 'GET') {
      return route.fulfill({ json: openTripDetail });
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

test('OWNER usa uma viagem já concluída como modelo: dados úteis vêm copiados, data/vagas/embarques ficam em branco, e salvar cria um rascunho novo', async ({ page }) => {
  let created: Record<string, unknown> | null = null;
  await mockOrganizationApi(page, {
    role: 'OWNER',
    onCreate: (body) => {
      created = body as Record<string, unknown>;
      return { ...openTrip, id: 'trip-2', title: (body as { title: string }).title, status: 'DRAFT', updatedAt: '2030-01-01T00:00:00.000Z' };
    },
  });
  await login(page);
  await expect(page.getByText('Trilha do Pico (já rodada)')).toBeVisible();
  // Já concluída: nada de editar/excluir, só o modelo.
  await expect(page.getByRole('button', { name: /^Editar/ })).toHaveCount(0);

  await page.getByRole('button', { name: /^Usar.*como modelo/ }).click();
  await expect(page.getByRole('heading', { name: 'Nova viagem a partir de modelo' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Trilha do Pico (já rodada)');

  // Texto, cidade e preço reaproveitados; data, horário e vagas em branco.
  await expect(page.locator('#org-trip-title')).toHaveValue('Trilha do Pico (já rodada)');
  await expect(page.locator('#org-trip-city')).toHaveValue('Areia');
  await expect(page.locator('#org-trip-start')).toHaveValue('');
  await expect(page.locator('#org-trip-spots')).toHaveValue('');
  // Embarque antigo (horário da execução anterior) não aparece na lista.
  await expect(page.getByText('Shopping', { exact: true })).toHaveCount(0);

  // Nada foi salvo ainda: fechar sem preencher a nova data pergunta antes de descartar.
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { name: 'Descartar alterações?' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Descartar alterações?' }).getByRole('button', { name: 'Cancelar' }).click();

  await page.locator('#org-trip-start').fill('2031-03-01T09:00');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Nova viagem a partir de modelo' })).toHaveCount(0);

  expect(created).not.toBeNull();
  const body = created as Record<string, unknown>;
  expect(body.title).toBe('Trilha do Pico (já rodada)');
  expect(body.spotsLeft).toBeNull();
  expect(body.departures).toEqual([]);
  expect(body.startDateISO).toContain('2031-03-01');
  // A viagem original (trip-1) continua na lista, intocada.
  await expect(page.getByText('Trilha do Pico (já rodada)')).toHaveCount(2);
});

test('MEMBER não vê a ação de usar como modelo (painel só de leitura)', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'MEMBER' });
  await login(page);
  await expect(page.getByText('Trilha do Pico (já rodada)')).toBeVisible();
  await expect(page.getByRole('button', { name: /como modelo/ })).toHaveCount(0);
});
