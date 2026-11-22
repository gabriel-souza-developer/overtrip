import { expect, test } from '@playwright/test';

// Paridade OVERTRIP/agências: reaproveita os componentes de prévia do site
// (TripCardPreview/TripProposalPreview, os mesmos do formulário legado) no
// formulário de viagens das agências. Cobre: conteúdo ao vivo sem salvar,
// ausência de mídia, a foto usando a leitura autenticada por empresa (nunca
// o caminho público/legado), desktop e celular, e que MEMBER (somente
// leitura) nunca alcança o formulário nem a prévia. Mesma convenção de mock
// de organization-trip-create.spec.ts.

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };
const draftTrip = {
  id: 'trip-1', title: 'Trilha da Serra', category: 'Trilha', description: 'Descrição atual', city: 'Lucena', region: 'PB', updatedAt: '2029-01-01T00:00:00.000Z',
  startDateISO: '2030-06-01T09:00:00.000Z', endDateISO: null, status: 'DRAFT',
};
// PNG 1x1 real e válido: a prévia carrega a imagem de verdade (<img src>),
// então uma resposta JSON no lugar dispararia onError e esconderia o bug
// que o teste de leitura autenticada precisa pegar.
const ONE_PX_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

const draftTripDetail = {
  ...draftTrip,
  headlineDisplay: null, filterCategory: null,
  departureTime: null, departureTolerance: null, returnTime: null, scheduleInfo: null, scheduleTBD: false,
  priceValue: null, priceDisplay: null, priceUnit: 'por pessoa', free: false,
  intensityClass: 'moderado', spotsLeft: null, trailDistance: null, supportPoint: null, supportPointInfo: null,
  meetingCity: null, meetingPoint: null, meetingTBD: false, meetingDetails: null, meetingMapsQuery: null,
  includes: [], includesHighlight: null, itinerary: [], routeNotes: [], importantInfo: [],
  media: [{ src: '/api/public/media/foto-legado.jpg', alt: 'Capa da trilha', previewSrc: '/api/organizations/a/tourism/media/foto-empresa-a.jpg' }],
  departures: [],
};

function mockOrganizationApi(page: import('@playwright/test').Page, { role, trips, tripDetail }: {
  role: string; trips: typeof draftTrip[]; tripDetail?: typeof draftTripDetail;
}) {
  let authenticated = false;
  return page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role }] } });
    if (url.pathname === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE', defaultPriceUnit: null, brandColor: null }, role } });
    // Leitura autenticada por empresa da própria foto (rewriteSrc em
    // organizationMediaRoutes.ts): precisa responder com uma imagem de
    // verdade, nunca cair no fallback de JSON abaixo.
    if (url.pathname.startsWith('/api/organizations/a/tourism/media/') && request.method() === 'GET') {
      return route.fulfill({ contentType: 'image/png', body: ONE_PX_PNG });
    }
    if (url.pathname === '/api/organizations/a/tourism/trips') {
      if (request.method() === 'GET') return route.fulfill({ json: { data: trips, pagination: { page: 1, limit: 20, total: trips.length, totalPages: 1 } } });
      if (request.method() === 'POST') return route.fulfill({ status: 201, json: { ...draftTrip, title: (request.postDataJSON() as { title: string }).title } });
    }
    if (url.pathname === '/api/organizations/a/tourism/trips/trip-1' && request.method() === 'GET') {
      return route.fulfill({ json: tripDetail ?? draftTripDetail });
    }
    if (url.pathname === '/api/organizations/a/tourism/trips/trip-1/documents') {
      return route.fulfill({ json: [] });
    }
    if (url.pathname === '/api/organizations/a/tourism/trips/trip-1' && request.method() === 'PUT') {
      return route.fulfill({ json: { ...draftTrip, ...(request.postDataJSON() as Record<string, unknown>) } });
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
  await page.getByRole('link', { name: 'Viagens', exact: true }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/trips$/);
}

test('prévia do card acompanha o preenchimento de uma viagem nova, sem salvar nada', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let writes = 0;
  await mockOrganizationApi(page, { role: 'OWNER', trips: [] });
  await page.route('**/api/organizations/a/tourism/trips', (route) => { if (route.request().method() !== 'GET') writes++; return route.continue(); });
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await page.getByText('Ver prévia ilustrativa do card').click();
  const preview = page.getByRole('complementary', { name: 'Prévia ilustrativa do card' });
  await expect(preview).toContainText('Nome da viagem');

  await page.locator('#org-trip-title').fill('Trilha da Serra Nova');
  await expect(preview.getByRole('heading', { name: 'Trilha da Serra Nova' })).toBeVisible();
  await page.locator('#org-trip-city').fill('Lucena');
  await expect(preview).toContainText('Horário não informado');
  expect(writes).toBe(0);
});

test('sem fotos, a prévia do card mostra que a capa ainda vai aparecer (nunca inventa uma imagem)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockOrganizationApi(page, { role: 'OWNER', trips: [] });
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await page.getByText('Ver prévia ilustrativa do card').click();
  const preview = page.getByRole('complementary', { name: 'Prévia ilustrativa do card' });
  await expect(preview).toContainText('A capa aparecerá aqui');
  await expect(preview.locator('img')).toHaveCount(0);
});

test('prévia carrega a foto pela leitura autenticada da empresa, nunca pelo caminho público/legado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockOrganizationApi(page, { role: 'OWNER', trips: [draftTrip] });
  await login(page);
  await page.getByRole('button', { name: /^Editar/ }).click();
  await expect(page.getByRole('heading', { name: 'Editar viagem' })).toBeVisible();
  await page.getByText('Ver prévia ilustrativa do card').click();
  const cover = page.getByRole('complementary', { name: 'Prévia ilustrativa do card' }).getByRole('img', { name: 'Capa da trilha' });
  await expect(cover).toHaveAttribute('src', '/api/organizations/a/tourism/media/foto-empresa-a.jpg');
});

test('prévia pode ser aberta e acompanha o preenchimento no celular', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER', trips: [] });
  await login(page);
  // Redimensiona só depois de entrar, igual aos demais testes móveis do
  // painel (ver organization-trip-delete.spec.ts): a navegação lateral
  // some atrás de um botão "Abrir menu" em telas estreitas.
  await page.setViewportSize({ width: 360, height: 780 });
  await page.reload();
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await page.getByText('Ver prévia ilustrativa do card').click();
  const preview = page.getByRole('complementary', { name: 'Prévia ilustrativa do card' });
  await page.locator('#org-trip-title').fill('Viagem para a serra');
  await expect(preview.getByRole('heading', { name: 'Viagem para a serra' })).toBeVisible();
});

test('prévia da proposta usa o nome da própria empresa por padrão, nunca a marca OVERTRIP', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'OWNER', trips: [] });
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await page.locator('#org-trip-title').fill('Trilha nova');
  await page.getByRole('button', { name: 'Prévia da proposta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Prévia da proposta' });
  await expect(dialog.getByLabel('Agência ou organizador')).toHaveValue('Agência A');
  await expect(dialog).toContainText('Agência A');
  await expect(dialog).not.toContainText('OVERTRIP');
});

test('prévia (card e proposta) nunca aparece para MEMBER, que só tem leitura', async ({ page }) => {
  await mockOrganizationApi(page, { role: 'MEMBER', trips: [draftTrip] });
  await login(page);
  await expect(page.getByText('Trilha da Serra')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nova viagem' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Editar/ })).toHaveCount(0);
  await expect(page.getByText('Ver prévia ilustrativa do card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Prévia da proposta' })).toHaveCount(0);
});
