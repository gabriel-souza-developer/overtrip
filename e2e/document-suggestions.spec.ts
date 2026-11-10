import { expect, test } from '@playwright/test';

test('revisa a origem e aplica somente os campos escolhidos sem salvar', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'test-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: 'admin', email: 'admin@example.test', name: 'Admin', role: 'admin' }));
  });
  let writes = 0;
  await page.route(/\/api\/(?!.*\.tsx?(?:\?|$))/, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: { id: 'admin', email: 'admin@example.test', name: 'Admin', role: 'admin' } });
    if (url.pathname.endsWith('/suggestions')) return route.fulfill({ json: {
      draft: { title: 'Novo título', city: 'Matureia' }, warnings: [],
      sources: {
        title: { documentId: 'doc-1', filename: 'roteiro.pdf', page: 1, excerpt: 'Novo título' },
        city: { documentId: 'doc-1', filename: 'roteiro.pdf', page: 2, excerpt: 'Matureia' },
      },
    } });
    if (url.pathname.endsWith('/documents')) return route.fulfill({ json: [{ id: 'doc-1', originalFilename: 'roteiro.pdf', sizeBytes: 123, extractionStatus: 'READY', retentionUntil: '2030-01-01T00:00:00.000Z' }] });
    if (url.pathname.endsWith('/ai/status')) return route.fulfill({ json: { enabled: false } });
    if (url.pathname.endsWith('/visits')) return route.fulfill({ json: { data: [], pagination: { totalPages: 1 } } });
    if (url.pathname.endsWith('/trips/trip-1')) {
      if (route.request().method() !== 'GET') writes++;
      return route.fulfill({ json: {
        id: 'trip-1', title: 'Título atual', category: '', description: '', city: '', region: '',
        startDateISO: '2027-01-01T00:00:00.000Z', endDateISO: null, departureTime: '', returnTime: '',
        scheduleTBD: false, priceValue: null, priceUnit: 'por pessoa', free: false, intensityClass: 'moderado', spotsLeft: null,
        meetingTBD: false, includes: [], itinerary: [], media: [], buttonLabel: 'Quero viajar', buttonClass: 'button-dark',
        status: 'DRAFT', availabilitySchema: 'https://schema.org/InStock',
      } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/trips/trip-1/edit');
  // A extração de sugestões com IA fica recolhida por padrão.
  await page.locator('summary').filter({ hasText: 'Extrair sugestões com IA de um PDF' }).click();
  await page.getByRole('button', { name: 'Sugerir campos' }).click();
  await expect(page.getByText('roteiro.pdf, página 2: “Matureia”')).toBeVisible();
  const city = page.getByRole('checkbox', { name: /Cidade.*Matureia/ });
  const title = page.getByRole('checkbox', { name: /Nome da viagem.*Novo título/ });
  await expect(city).not.toBeChecked();
  await expect(title).not.toBeChecked();
  await city.check();
  await page.getByRole('button', { name: 'Usar selecionados (1)' }).click();
  await expect(page.locator('#city')).toHaveValue('Matureia');
  await expect(page.locator('#title')).toHaveValue('Título atual');
  expect(writes).toBe(0);
});
