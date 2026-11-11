import { expect, test } from '@playwright/test';

test('revisa a origem e aplica somente os campos escolhidos sem salvar', async ({ page }) => {
  await page.context().addCookies([{
    name: 'overtrip_session', value: 'playwright-cookie-session', url: 'http://127.0.0.1:4300', httpOnly: true, sameSite: 'Lax',
  }]);
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'legacy-token-must-be-removed');
  });
  let writes = 0;
  let meCookie: string | undefined;
  let meRequests = 0;
  let downloadCookie: string | undefined;
  await page.route(/\/api\/(?!.*\.tsx?(?:\?|$))/, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me')) {
      meRequests++;
      meCookie = route.request().headers().cookie;
      return route.fulfill({ json: { id: 'admin', email: 'admin@example.test', name: 'Admin', role: 'admin' } });
    }
    if (url.pathname.endsWith('/documents/doc-1') && route.request().method() === 'GET') {
      downloadCookie = route.request().headers().cookie;
      return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4 teste' });
    }
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
  await expect.poll(() => meCookie).toBe('overtrip_session=playwright-cookie-session');
  expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
  // A extração de sugestões com IA fica recolhida por padrão.
  await page.locator('summary').filter({ hasText: 'Sugerir preenchimento com PDF e IA (opcional)' }).click();
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

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar' }).click();
  await download;
  expect(downloadCookie).toBe('overtrip_session=playwright-cookie-session');

  await page.reload();
  await expect.poll(() => meRequests).toBe(2);
  expect(meCookie).toBe('overtrip_session=playwright-cookie-session');
});
