import { expect, test } from '@playwright/test';

test('administrador edita e aprova uma versão de conhecimento', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'test-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: 'admin', email: 'admin@example.test', name: 'Admin', role: 'admin' }));
  });
  let sent: unknown;
  await page.route(/\/api\/(?!.*\.tsx?(?:\?|$))/, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/assistant-knowledge/versions')) return route.fulfill({ json: [] });
    if (path.endsWith('/assistant-knowledge')) {
      if (route.request().method() === 'POST') {
        sent = route.request().postDataJSON();
        return route.fulfill({ status: 201, json: { version: 1, entries: (sent as { entries: unknown }).entries, approvedById: 'admin', approvedAt: '2026-11-02T12:00:00Z' } });
      }
      return route.fulfill({ json: null });
    }
    if (path.endsWith('/whatsapp')) return route.fulfill({ json: { defaultWhatsapp: null } });
    if (path.endsWith('/trip-presentation')) return route.fulfill({ json: { buttonLabel: 'Quero viajar', buttonClass: 'button-dark', priceUnit: 'por pessoa' } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Adicionar pergunta' }).click();
  await page.getByLabel('Pergunta', { exact: true }).fill('Como reservar?');
  await page.getByLabel('Resposta aprovada').fill('Fale com a equipe.');
  await page.getByRole('button', { name: 'Aprovar nova versão' }).click();
  await expect(page.getByRole('status')).toContainText('Versão 1 aprovada.');
  expect(sent).toEqual({ expectedVersion: null, entries: [{ question: 'Como reservar?', answer: 'Fale com a equipe.' }] });
});
