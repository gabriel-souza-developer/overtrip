import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'playwright-test-token');
    localStorage.setItem('auth_user', JSON.stringify({
      id: 'playwright-admin',
      email: 'playwright@example.test',
      name: 'Playwright',
      role: 'ADMIN',
    }));
  });

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
});

test('formulário T23 oferece campos únicos de data e horário', async ({ page }) => {
  await page.goto('/trips/new');

  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toBeVisible();
  await expect(page.locator('input[type="date"]')).toHaveCount(2);
  await expect(page.locator('input[type="time"]')).toHaveCount(2);

  await page.locator('#startDateISO').fill('2026-12-15');
  await page.locator('#departureTime').fill('06:30');
  await page.locator('summary').filter({ hasText: 'Embarque e horários' }).click();
  await page.locator('#endDateISO').fill('2026-12-16');
  await page.locator('#returnTime').fill('20:15');

  await expect(page.locator('#startDateISO')).toHaveValue('2026-12-15');
  await expect(page.locator('#departureTime')).toHaveValue('06:30');
  await expect(page.locator('#endDateISO')).toHaveValue('2026-12-16');
  await expect(page.locator('#returnTime')).toHaveValue('20:15');
});

test('destino visitado preenche cidade e estado, e serviço padrão pode ser marcado', async ({ page }) => {
  await page.goto('/trips/new');

  const destination = page.getByRole('combobox', { name: 'Destino já visitado (opcional)' });
  await destination.fill('Pico do Jabre');
  await page.getByRole('option', { name: /Pico do Jabre/ }).click();
  await expect(page.locator('#city')).toHaveValue('Matureia');
  await expect(page.locator('#region')).toHaveValue('PB');

  await page.locator('summary').filter({ hasText: 'Sobre a viagem' }).click();
  await page.getByRole('checkbox', { name: 'Guia' }).check();
  await expect(page.getByRole('checkbox', { name: 'Guia' })).toBeChecked();
});

test('opção de CTA claro fica selecionável e mantém o estado marcado', async ({ page }) => {
  await page.goto('/trips/new');

  await page.locator('summary').filter({ hasText: 'Ajustes do site' }).click();
  const lightButton = page.getByRole('radio', { name: 'Claro' });
  await lightButton.check({ force: true });
  await expect(lightButton).toBeChecked();
});
