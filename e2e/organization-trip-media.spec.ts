import { expect, test, type Page, type Route } from '@playwright/test';
import sharp from 'sharp';

// Cobre a paridade de campos estendidos (preço, mídia, embarques) do
// formulário de viagens da empresa, adicionada a organization-trip-create.spec.ts
// (que cobre o essencial). Mesma convenção de mock de
// organization-visit-gallery-media.spec.ts para o envio de foto própria.

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };
const KEY = '0123456789abcdef0123456789abcdef';
const PUBLIC_SRC = `/api/public/media/${KEY}.jpg`;
const PREVIEW_SRC = `/api/organizations/a/tourism/media/${KEY}.jpg`;

let photo: Buffer;
test.beforeAll(async () => {
  photo = await sharp({ create: { width: 320, height: 200, channels: 3, background: '#1a7f5a' } }).jpeg().toBuffer();
});

function mockOrganizationApi(page: Page, onCreate: (route: Route, body: Record<string, unknown>, push: (item: unknown) => void) => unknown) {
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
    if (url.pathname === '/api/organizations/a/tourism/media' && request.method() === 'POST') {
      return route.fulfill({ status: 201, json: { id: 'm1', src: PUBLIC_SRC, previewSrc: PREVIEW_SRC, mimeType: 'image/jpeg', width: 320, height: 200, sizeBytes: photo.length, variants: [] } });
    }
    if (url.pathname === '/api/organizations/a/tourism/trips') {
      if (request.method() === 'GET') return route.fulfill({ json: { data: trips, pagination: { page: 1, limit: 20, total: trips.length, totalPages: 1 } } });
      if (request.method() === 'POST') return onCreate(route, request.postDataJSON() as Record<string, unknown>, (item) => trips.push(item));
    }
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  await page.getByRole('link', { name: 'Viagens', exact: true }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/trips$/);
}

test('OWNER cadastra preço, foto própria e um embarque pelo formulário de viagem', async ({ page }) => {
  let created: Record<string, unknown> | null = null;
  await mockOrganizationApi(page, (route, body, push) => {
    created = body;
    const result = { id: 'trip-1', title: body.title, category: body.category, description: body.description, city: body.city, region: body.region, startDateISO: body.startDateISO, endDateISO: null, status: 'DRAFT', updatedAt: '2030-01-01T00:00:00.000Z' };
    push(result);
    return route.fulfill({ status: 201, json: result });
  });
  await login(page);
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await page.locator('#org-trip-title').fill('Trilha do Mirante');
  await page.locator('#org-trip-category').fill('Trilha');
  await page.locator('#org-trip-city').fill('Areia');
  await page.locator('#org-trip-region').fill('PB');
  await page.locator('#org-trip-start').fill('2030-08-01T06:00');
  await page.locator('#org-trip-description').fill('Caminhada até o mirante com guia local.');

  // Foto própria: só é aceita pelo servidor se vier da rota de mídia desta empresa.
  await page.locator('#org-trip-photo-file').setInputFiles({ name: 'mirante.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.getByLabel('O que aparece nesta foto? (obrigatório)').fill('Vista do mirante');
  await page.getByRole('button', { name: 'Usar esta foto' }).click();

  // Preço fica visível no bloco essencial.
  await page.locator('#org-trip-price').fill('149,90');

  // Embarque fica visível no bloco de horários.
  await page.getByLabel('Horário da saída').fill('06h00');
  await page.getByLabel('Local da saída').fill('Praça Central');
  await page.getByLabel('Cidade da saída').fill('Areia');
  await page.getByRole('button', { name: 'Adicionar saída' }).click();

  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toHaveCount(0);
  await expect(page.getByText('Trilha do Mirante')).toBeVisible();

  expect(created).not.toBeNull();
  const body = created as Record<string, unknown>;
  // Nunca envia organizationId, status ou storedIdentity: o formulário não
  // oferece esses campos, então o corpo nunca os contém.
  expect(body).not.toHaveProperty('organizationId');
  expect(body).not.toHaveProperty('status');
  expect(body.priceValue).toBe(149.9);
  expect(body.media).toEqual([{ src: PUBLIC_SRC, alt: 'Vista do mirante' }]);
  expect(body.departures).toEqual([{ time: '06h00', place: 'Praça Central', city: 'Areia', mapsUrl: undefined, mapsQuery: undefined }]);
});
