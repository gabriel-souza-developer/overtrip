import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'playwright-test-token');
    localStorage.setItem('auth_user', JSON.stringify({
      id: 'playwright-admin',
      email: 'playwright@example.test',
      name: 'Playwright',
      role: 'admin',
    }));
  });

  // O painel confirma a sessão ao abrir; sem isso a pessoa cai no login.
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 'playwright-admin', email: 'playwright@example.test', name: 'Playwright', role: 'admin' } }));
  await page.route('**/api/visits**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      data: [{
        id: 'visit-1',
        title: 'Pico do Jabre',
        city: 'Matureia',
        region: 'PB',
        lat: -7.25,
        lng: -37.38,
      }],
      pagination: { totalPages: 1 },
    }),
  }));

  await page.route('**/api/ai/status', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ enabled: false }),
  }));
  await page.route('**/api/settings/trip-presentation', route => route.fulfill({ json: {
    buttonLabel: 'Quero viajar', buttonClass: 'button-dark', priceUnit: 'por pessoa',
  } }));
});

test('formulário T23 oferece campos únicos de data e horário', async ({ page }) => {
  await page.goto('/trips/new');

  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toBeVisible();
  await expect(page.locator('input[type="date"]')).toHaveCount(2);
  await expect(page.locator('input[type="time"]')).toHaveCount(2);

  await page.locator('#startDateISO').fill('2026-12-15');
  await page.locator('summary').filter({ hasText: 'Detalhes opcionais' }).click();
  await page.locator('#departureTime').fill('06:30');
  await page.locator('#endDateISO').fill('2026-12-16');
  await page.locator('#returnTime').fill('20:15');

  await expect(page.locator('#startDateISO')).toHaveValue('2026-12-15');
  await expect(page.locator('#departureTime')).toHaveValue('06:30');
  await expect(page.locator('#endDateISO')).toHaveValue('2026-12-16');
  await expect(page.locator('#returnTime')).toHaveValue('20:15');
});

test('formulário não tem mais o atalho de destino visitado, e serviço padrão pode ser marcado', async ({ page }) => {
  await page.goto('/trips/new');

  await expect(page.locator('#visited-place-search')).toHaveCount(0);

  await page.locator('summary').filter({ hasText: 'Detalhes opcionais' }).click();
  await page.getByRole('checkbox', { name: 'Guia' }).check();
  await expect(page.getByRole('checkbox', { name: 'Guia' })).toBeChecked();
});

test('prévia acompanha o preenchimento sem salvar a viagem', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let writes = 0;
  await page.route('**/api/trips', route => { if (route.request().method() !== 'GET') writes++; return route.fulfill({ json: {} }); });
  await page.goto('/trips/new');
  const preview = page.getByRole('complementary', { name: 'Prévia do card no site' }).filter({ visible: true });
  await page.locator('#title').fill('Trilha da serra');
  await expect(preview.getByRole('heading', { name: 'Trilha da serra' })).toBeVisible();
  await page.locator('#title').fill('Trilha do pôr do sol');
  await expect(preview.getByRole('heading', { name: 'Trilha do pôr do sol' })).toBeVisible();
  await page.locator('#startDateISO').fill('2026-12-15');
  await expect(preview).toContainText('15/12/2026');
  expect(writes).toBe(0);
});

test('prévia pode ser aberta e atualizada no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/trips/new');
  await page.getByText('Ver prévia da viagem').click();
  await page.locator('#title').fill('Viagem para o mar');
  await expect(page.getByRole('complementary', { name: 'Prévia do card no site' }).filter({ visible: true })).toContainText('Viagem para o mar');
});

test('prévia carrega capa relativa à raiz do site ao editar viagem', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/trips/trip-1', route => route.fulfill({ json: {
    id: 'trip-1', title: 'Viagem com capa', category: '', description: '', city: '', region: '',
    startDateISO: '2027-01-01T00:00:00.000Z', endDateISO: null, departureTime: '', returnTime: '',
    scheduleTBD: false, priceValue: null, priceUnit: 'por pessoa', free: false, intensityClass: 'moderado', spotsLeft: null,
    meetingTBD: false, includes: [], itinerary: [], media: [{ src: 'assets/images/coqueirinho-praia-vista-aerea.jpg', alt: 'Capa' }],
    buttonLabel: 'Quero viajar', buttonClass: 'button-dark', status: 'DRAFT', availabilitySchema: 'https://schema.org/InStock',
  } }));
  await page.route('**/api/trips/trip-1/documents', route => route.fulfill({ json: [] }));
  await page.goto('/trips/trip-1/edit');
  const cover = page.getByRole('complementary', { name: 'Prévia do card no site' }).filter({ visible: true }).getByRole('img', { name: 'Capa' });
  await expect(cover).toHaveAttribute('src', '/assets/images/coqueirinho-praia-vista-aerea.jpg');
  await expect.poll(() => cover.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
});

test('opção de CTA claro fica selecionável nos padrões globais', async ({ page }) => {
  await page.route('**/api/settings/whatsapp', route => route.fulfill({ json: { defaultWhatsapp: null } }));
  await page.goto('/settings');
  const style = page.getByLabel('Estilo do botão');
  await style.selectOption('button-light');
  await expect(style).toHaveValue('button-light');
});
